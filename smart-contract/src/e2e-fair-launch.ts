// End-to-end check of the Fair Launch on buildnet, with the app's code: a launch with a dev buy, a
// buy, a sell, the buy that sells the curve out, the graduation (by its own deferred call, or by
// hand when the call isn't booked or doesn't run), the Dusa pool it made, the fees and their
// withdrawal. Measures the gas `graduate` uses (the deferred call gets
// FairConfig.autoGraduateGas) and checks after every step that the contract's balance is its
// fees + the MAS in its curves + a constant (nothing lost, nothing left in no account).
//   npx tsx src/e2e-fair-launch.ts      (FAIR_DEPLOYMENT=fair-launch-buildnet by default)
// The account is PRIVATE_KEY (test MAS) and must be the Fair Launch admin (fees withdrawal).
// Costs about the config's target + 15 MAS a run. Never on mainnet.
import 'dotenv/config';
import { readFileSync } from 'fs';
import {
  Account,
  Args,
  JsonRpcProvider,
  Mas,
  Operation,
  OperationStatus,
  PublicAPI,
  PublicApiUrl,
  StorageCost,
} from '@massalabs/massa-web3';
import { contractReason, eventFields } from '../../src/app/core/launchpad/events';
import { EMPTY_INFO, writeInfo } from '../../src/app/core/launchpad/records';
import { ALLOWANCE_COINS } from '../../src/app/core/launchpad/presale-cost';
import { NETWORKS } from '../../src/app/core/network/networks';
import { readPairList, readPairState } from '../../src/app/core/dusa/dusa';
import {
  CREATE_MARGIN,
  CURVE_TOKENS,
  DEFAULT_SLIPPAGE_BPS,
  GRADUATE_COINS,
  POOL_TOKENS,
  TOTAL_SUPPLY,
  TRADE_MARGIN,
  buyCoins,
  feeOf,
  quoteBuy,
  quoteSell,
  withSlippage,
} from '../../src/app/core/fairlaunch/curve';
import {
  Launch,
  STATE_COMPLETE,
  STATE_GRADUATED,
  STATE_TRADING,
  Trade,
  readFairConfig,
  readLaunch,
  readTradeList,
} from '../../src/app/core/fairlaunch/records';
import { candles, tradePrice } from '../../src/app/core/fairlaunch/chart';

if (process.env['NETWORK'] === 'mainnet') throw new Error('e2e runs on buildnet only');
const DUSA = NETWORKS.buildnet.dusa!;
const FAIR: string = JSON.parse(
  readFileSync(
    `deployments/${process.env['FAIR_DEPLOYMENT'] || 'fair-launch-buildnet'}.json`,
    'utf8',
  ),
).address;
const account = await Account.fromEnv();
const provider = JsonRpcProvider.buildnet(account);
const api = new PublicAPI(PublicApiUrl.Buildnet);
const ME = account.address.toString();
const MAS = 1_000_000_000n;
const mas = (n: bigint) => `${n < 0n ? '-' : ''}${Mas.toString(n < 0n ? -n : n)} MAS`;
/** GRADUATION_RESERVE in fair-launch.ts: createLBPair coins + 11 bins' storage + allowance. */
const GRADUATION_RESERVE = 12n * MAS + ((140_100_000n + 11n * 45_600_000n) * 6n) / 5n + 10_000_000n;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function read(target: string, func: string, args = new Args()) {
  const result = await provider.readSC({ target, func, parameter: args, caller: ME });
  if (result.info.error) throw new Error(`${func}: ${contractReason(result.info.error)}`);
  return result.value;
}

/** The last operation `send` made. */
let lastOp = '';

/** Waits for the final state, or only the speculative one (the next slot) when `fast`. */
async function send(target: string, func: string, args: Args, coins: bigint, fast = false) {
  const sim = await provider.readSC({ target, func, parameter: args, coins, caller: ME });
  if (sim.info.error) throw new Error(`${func} simulation: ${contractReason(sim.info.error)}`);
  const op: Operation = await provider.callSC({ target, func, parameter: args, coins });
  lastOp = op.id;
  const status = fast ? await op.waitSpeculativeExecution() : await op.waitFinalExecution();
  const events = (fast ? await op.getSpeculativeEvents() : await op.getFinalEvents()).map(
    (e) => e.data,
  );
  const ok = fast ? OperationStatus.SpeculativeSuccess : OperationStatus.Success;
  if (status !== ok) throw new Error(`${func} failed: ${contractReason(events.at(-1) ?? '')}`);
  return events;
}

async function refusal(target: string, func: string, args: Args, coins: bigint) {
  const sim = await provider.readSC({ target, func, parameter: args, coins, caller: ME });
  return sim.info.error ? contractReason(sim.info.error) : '';
}

const idArgs = (id: bigint) => new Args().addU64(id);
const getLaunch = async (id: bigint): Promise<Launch> =>
  readLaunch(new Args(await read(FAIR, 'getLaunch', idArgs(id))));
const getTrades = async (id: bigint, from = 0n, limit = 100n): Promise<Trade[]> =>
  readTradeList(await read(FAIR, 'getTrades', idArgs(id).addU64(from).addU32(limit)));
const fees = async () => new Args(await read(FAIR, 'fees')).nextU64();
const myBalance = async () => provider.balance(false);
const balanceOf = async (address: string) =>
  (await provider.balanceOf([address], false))[0].balance;
const tokenBalance = async (token: string, holder: string) =>
  new Args(await read(token, 'balanceOf', new Args().addString(holder))).nextU256();

/** Contract balance − fees − MAS in the curves: must never change. */
async function rest(): Promise<bigint> {
  const count = new Args(await read(FAIR, 'count')).nextU64();
  let escrow = 0n;
  for (let id = 1n; id <= count; id++) {
    const l = await getLaunch(id);
    if (l.state === STATE_TRADING) escrow += l.masIn;
    else if (l.state === STATE_COMPLETE) escrow += l.masIn - l.autoFee; // its deferred call is paid
  }
  return (await balanceOf(FAIR)) - (await fees()) - escrow;
}

// ---- the deployment ----------------------------------------------------------------------------
const config = readFairConfig(new Args(await read(FAIR, 'config')));
const version = new TextDecoder().decode(await read(FAIR, 'version'));
const admin = new TextDecoder().decode(await read(FAIR, 'admin'));
console.log(
  `Fair Launch ${FAIR} v${version}, target ${mas(config.targetMas)}, ` +
    `auto-graduation gas ${config.autoGraduateGas}`,
);
check('this account is the admin', admin === ME, admin);
const [versionBytes] = await provider.readStorage(
  config.launchpad,
  [new Uint8Array([...new TextEncoder().encode('tplv:'), 0])],
  false,
);
const tplVersion = new DataView(new Uint8Array(versionBytes!).buffer).getUint32(0, true);
const [code] = await provider.readStorage(
  config.launchpad,
  [new Uint8Array([...new TextEncoder().encode('tpl:'), 0, 0, 0, 0, tplVersion])],
  false,
);
const rest0 = await rest();
const spentAtStart = await myBalance();
// The Launchpad's holder discount on the launch fee (the contract asks it the same).
const discountBytes = await read(config.launchpad, 'getHolderDiscount', new Args().addString(ME));
const discountBps = new DataView(
  discountBytes.buffer,
  discountBytes.byteOffset,
  discountBytes.byteLength,
).getUint16(0, true);
const launchFee = config.creationFee - feeOf(config.creationFee, discountBps);
console.log(`  launch fee ${mas(launchFee)} (holder discount ${discountBps / 100}%)`);

// ---- createLaunch with a dev buy of 1 MAS ------------------------------------------------------
const symbol =
  'F' +
  Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, 'X');
const dev = 1n * MAS;
const devTokens = quoteBuy({ virtualMas: config.targetMas / 3n, masIn: 0n, sold: 0n }, dev).tokens;
const cost =
  launchFee +
  config.deployDeposit +
  StorageCost.smartContractDeploy(code!.length) +
  dev +
  feeOf(dev, config.tradeFeeBps);
const launchArgs = () =>
  writeInfo(new Args().addString('Fair Test').addString(symbol), {
    ...EMPTY_INFO,
    description: 'e2e-fair-launch',
  })
    .addU64(dev)
    .addU64(withSlippage(devTokens, DEFAULT_SLIPPAGE_BPS));
const fees0 = await fees();
let before = await myBalance();
const created = await send(FAIR, 'createLaunch', launchArgs(), cost + CREATE_MARGIN);
const ops = [lastOp];
const createSpent = before - (await myBalance());
const [idText, token] = eventFields(created, 'LAUNCH_CREATED') ?? [];
const id = BigInt(idText);
console.log(`Launch #${id}: ${symbol} at ${token}`);
check(
  'createLaunch costs what the app shows, plus the record',
  createSpent >= cost && createSpent < cost + CREATE_MARGIN,
  `${mas(createSpent)} spent, app's cost ${mas(cost)}`,
);
let l = await getLaunch(id);
check(
  'the record: creator, trading, the dev buy sold',
  l.token === token && l.creator === ME && l.state === STATE_TRADING && l.sold === devTokens,
  `${l.sold} units sold for ${mas(l.masIn)}`,
);
check('the dev buy is in the curve', l.masIn === dev, mas(l.masIn));
check(
  'the launch keeps the template it was deployed from',
  l.templateVersion === tplVersion,
  `RC-Token v${l.templateVersion}`,
);
const decimals = (await read(token, 'decimals'))[0];
const supply = new Args(await read(token, 'totalSupply')).nextU256();
const owner = new TextDecoder().decode(await read(token, 'ownerAddress'));
check(
  'the token: 1 B supply, 9 decimals, no owner',
  decimals === 9 && supply === TOTAL_SUPPLY && owner === '',
  `owner '${owner}'`,
);
check('the creator got the dev buy', (await tokenBalance(token, ME)) === devTokens);
check(
  'the Fair Launch holds the rest',
  (await tokenBalance(token, FAIR)) === TOTAL_SUPPLY - devTokens,
);
check(
  'launchOfToken finds it',
  new Args(await read(FAIR, 'launchOfToken', new Args().addString(token))).nextU64() === id,
);
check(
  'fees: launch fee (less the holder discount) + the dev buy’s trade fee',
  (await fees()) === fees0 + launchFee + feeOf(dev, config.tradeFeeBps),
);
check('balance = fees + curves (+ constant)', (await rest()) === rest0);
const taken = await refusal(FAIR, 'createLaunch', launchArgs(), cost + CREATE_MARGIN);
check('the same symbol again is refused', /already taken/.test(taken), taken);

// ---- a buy of 5 MAS -------------------------------------------------------------------------
const buyMas = 5n * MAS;
const predicted = quoteBuy(l, buyMas);
const quoted = new Args(await read(FAIR, 'quoteBuyOf', idArgs(id).addU64(buyMas)));
check('quoteBuyOf = the app’s curve mirror', quoted.nextU64() === predicted.tokens);
await send(
  FAIR,
  'buy',
  idArgs(id).addU64(buyMas).addU64(withSlippage(predicted.tokens, DEFAULT_SLIPPAGE_BPS)),
  buyCoins(buyMas, l.tradeFeeBps),
);
ops.push(lastOp);
const held = await tokenBalance(token, ME);
check('the buy got the tokens predicted', held === devTokens + predicted.tokens);
l = await getLaunch(id);
check('the curve moved', l.masIn === dev + buyMas, mas(l.masIn));
check('balance = fees + curves (+ constant)', (await rest()) === rest0);

// ---- selling half back ---------------------------------------------------------------------
const sellTokens = held / 2n;
const gross = quoteSell(l, sellTokens);
const net = gross - feeOf(gross, l.tradeFeeBps);
const sellQuote = new Args(await read(FAIR, 'quoteSellOf', idArgs(id).addU64(sellTokens)));
check('quoteSellOf = the app’s curve mirror', sellQuote.nextU64() === net, mas(net));
await send(
  token,
  'increaseAllowance',
  new Args().addString(FAIR).addU256(sellTokens),
  ALLOWANCE_COINS,
);
before = await myBalance();
const sold = await send(
  FAIR,
  'sell',
  idArgs(id).addU64(sellTokens).addU64(withSlippage(net, DEFAULT_SLIPPAGE_BPS)),
  TRADE_MARGIN,
);
ops.push(lastOp);
const sellGain = (await myBalance()) - before;
const sellEvent = eventFields(sold, 'SELL') ?? [];
check('the sell paid the gross price', sellEvent[2] === gross.toString(), mas(gross));
check(
  'the seller got the MAS (less the operation fee)',
  sellGain > net - MAS / 10n && sellGain <= net,
  `${mas(sellGain)} for ${mas(net)} after the trade fee`,
);
l = await getLaunch(id);
check('the curve took the tokens back', (await tokenBalance(token, ME)) === held - sellTokens);
check('balance = fees + curves (+ constant)', (await rest()) === rest0);
const notReady = await refusal(FAIR, 'graduate', idArgs(id), GRADUATE_COINS);
check('graduate before the sell-out is refused', /not ready/.test(notReady), notReady);

// ---- hidden by the admin: no buys, sells stay open ---------------------------------------------
await send(FAIR, 'setHidden', idArgs(id).addBool(true), MAS / 20n);
l = await getLaunch(id);
const hiddenBuy = await refusal(
  FAIR,
  'buy',
  idArgs(id).addU64(MAS).addU64(0n),
  buyCoins(MAS, l.tradeFeeBps),
);
check('a hidden launch refuses buys', l.hidden && /hidden/.test(hiddenBuy), hiddenBuy);
check(
  'and quotes none',
  new Args(await read(FAIR, 'quoteBuyOf', idArgs(id).addU64(MAS))).nextU64() === 0n,
);
await send(FAIR, 'setHidden', idArgs(id).addBool(false), MAS / 20n);
l = await getLaunch(id);
check(
  'unhidden, it quotes buys again',
  !l.hidden && new Args(await read(FAIR, 'quoteBuyOf', idArgs(id).addU64(MAS))).nextU64() > 0n,
);

// ---- the minimum time on the curve -----------------------------------------------------------
check(
  'the launch keeps the config’s minimum time',
  l.sellOutFrom === l.createdAt + Number(config.minCurveMs),
  `not before ${new Date(l.sellOutFrom).toISOString()}`,
);
const waited = Date.now() < l.sellOutFrom;
if (waited) {
  // Before it, the biggest buy takes all but the last unit: the curve can't sell out yet.
  const allButOne = CURVE_TOKENS - l.sold - 1n;
  const capped = quoteBuy(l, l.targetMas * 2n, allButOne);
  const cappedOffer = (capped.mas * 101n) / 100n;
  await send(
    FAIR,
    'buy',
    idArgs(id).addU64(cappedOffer).addU64(allButOne),
    buyCoins(cappedOffer, l.tradeFeeBps),
  );
  ops.push(lastOp);
  l = await getLaunch(id);
  check(
    'before its minimum time the curve keeps its last unit',
    l.state === STATE_TRADING && l.sold === CURVE_TOKENS - 1n,
  );
  const tooEarly = await refusal(
    FAIR,
    'buy',
    idArgs(id).addU64(MAS).addU64(0n),
    buyCoins(MAS, l.tradeFeeBps),
  );
  check('the last unit waits for the minimum time', /minimum time/.test(tooEarly), tooEarly);
  const wait = l.sellOutFrom - Date.now() + 20_000;
  console.log(`  waiting ${Math.ceil(wait / 1000)} s for the minimum time…`);
  await new Promise((r) => setTimeout(r, wait));
  l = await getLaunch(id);
} else console.log('  (the minimum time had passed already: the cap is not checked)');

// ---- the buy that sells the curve out ----------------------------------------------------------
// Speculative only: its deferred call graduates the launch 2 periods (~32 s) later, before the
// buy is final, and the checks below read the launch while it waits.
const left = CURVE_TOKENS - l.sold;
const last = quoteBuy(l, l.targetMas * 2n);
check('the last buy is capped at what is left', last.tokens === left, `${mas(last.mas)} needed`);
const offer = (last.mas * 101n) / 100n;
before = await myBalance();
const outEvents = await send(
  FAIR,
  'buy',
  idArgs(id).addU64(offer).addU64(left),
  buyCoins(offer, l.tradeFeeBps),
  true,
);
const feesBeforeGraduation = await fees();
ops.push(lastOp);
const lastSpent = before - (await myBalance());
check(
  'the buyer paid only for what was left',
  lastSpent < last.mas + feeOf(last.mas, l.tradeFeeBps) + TRADE_MARGIN,
  `${mas(lastSpent)} spent`,
);
l = await getLaunch(id);
const masAtSellOut = l.masIn;
check('the curve is complete', l.state === STATE_COMPLETE && l.sold === CURVE_TOKENS);
check('it raised about the target', masAtSellOut > l.targetMas - MAS, mas(masAtSellOut));
const scheduled = eventFields(outEvents, 'GRADUATION_SCHEDULED');
const quote = (
  await api.deferredCallQuote([
    {
      target_slot: { period: Number((await api.status()).last_slot!.period) + 2, thread: 0 },
      max_gas_request: Number(config.autoGraduateGas),
      params_size: 12,
    },
  ])
)[0];
const quotePrice = Mas.fromString(String(quote.price));
console.log(
  `  deferred call: ${scheduled ? `booked (${scheduled[1]})` : 'not booked'}, ` +
    `autoFee ${mas(l.autoFee)}, quote now ${mas(quotePrice)}`,
);
if (config.autoGraduateGas > 0n && quotePrice <= masAtSellOut / 20n)
  check('the graduation was booked', !!scheduled && l.autoFee > 0n);
check('balance = fees + curves (+ constant)', (await rest()) === rest0, `state ${l.state}`);
const late = await refusal(FAIR, 'buy', idArgs(id).addU64(MAS).addU64(0n), buyCoins(MAS, 100));
check('a buy after the sell-out is refused', /sold out/.test(late), late);

// ---- graduation ------------------------------------------------------------------------------
const sim = await provider.readSC({
  target: FAIR,
  func: 'graduate',
  parameter: idArgs(id),
  coins: GRADUATE_COINS,
  caller: ME,
});
const gas = BigInt(sim.info.gasCost);
console.log(`  graduate simulation: ${sim.info.error ? contractReason(sim.info.error) : 'ok'}`);
check(
  'graduate fits the deferred call’s gas',
  !sim.info.error && (config.autoGraduateGas === 0n || gas <= config.autoGraduateGas),
  `${gas} gas used, ${config.autoGraduateGas} booked`,
);
const graduationFee = feeOf(masAtSellOut, l.graduationFeeBps);
const poolMas = masAtSellOut - graduationFee - l.autoFee - GRADUATION_RESERVE;
let byItself = false;
if (scheduled) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    l = await getLaunch(id);
    if (l.state === STATE_GRADUATED) break;
    await new Promise((r) => setTimeout(r, 8_000));
  }
  byItself = l.state === STATE_GRADUATED;
  if (!byItself) {
    const info = await api.deferredCallsInfo([scheduled[1]]).catch((e) => String(e));
    console.log(`  the deferred call didn't graduate it: ${JSON.stringify(info)}`);
  }
  check('it graduated by itself (deferred call)', byItself);
}
if (!byItself) {
  before = await myBalance();
  await send(FAIR, 'graduate', idArgs(id), GRADUATE_COINS);
  const reward = (await myBalance()) - before;
  console.log(`  graduated by hand: the caller got ${mas(reward)} (reserve left, less the op fee)`);
  l = await getLaunch(id);
}
check(
  'graduated',
  l.state === STATE_GRADUATED && l.masIn === 0n,
  `${l.pair}, bin step ${l.binStep}`,
);
const feeGain = (await fees()) - feesBeforeGraduation;
if (byItself)
  check(
    'the fees got the graduation fee + what the reserve did not use',
    feeGain > graduationFee && feeGain < graduationFee + GRADUATION_RESERVE,
    `${mas(feeGain)} (graduation fee ${mas(graduationFee)})`,
  );
else check('the fees got the graduation fee', feeGain === graduationFee, mas(feeGain));
// Running a deferred call, the node gives its sender back the storage part of the price paid at
// booking (~0.04 MAS): it lands in the contract outside any account. Never more than that.
const DEFERRED_STORAGE_REFUND = MAS / 20n;
const restAfter = await rest();
check(
  'balance = fees + curves (+ constant, + the deferred call’s storage refund)',
  restAfter >= rest0 && restAfter - rest0 <= (byItself ? DEFERRED_STORAGE_REFUND : 0n),
  `${mas(restAfter - rest0)} more than at the start`,
);

// ---- the trade history (chart and trade list) --------------------------------------------------
const history = await getTrades(id);
const tradeCount = waited ? 5 : 4;
check(
  'the history holds every trade',
  l.trades === BigInt(tradeCount) && history.length === tradeCount,
  `${l.trades}`,
);
check(
  `${waited ? 'buy, buy, sell, buy, buy' : 'buy, buy, sell, buy'} — by this account`,
  history.map((t) => (t.isBuy ? 'B' : 'S')).join('') === (waited ? 'BBSBB' : 'BBSB') &&
    history.every((t) => t.trader === ME),
);
check(
  'each trade keeps the MAS of its event',
  history[0].mas === dev && history[1].mas === buyMas && history[2].mas === gross,
);
check(
  'the last trade left the curve sold out',
  history.at(-1)!.sold === CURVE_TOKENS && history.at(-1)!.masIn === masAtSellOut,
);
check(
  'times follow the blocks, in order',
  history.every((t, i) => i === 0 || t.time >= history[i - 1].time) &&
    Math.abs(history[0].time - l.createdAt) < 1_000,
);
check(
  'each trade keeps the operation that made it (explorer link)',
  history.map((t) => t.opId).join() === ops.join(),
  history[0].opId,
);
const page = await getTrades(id, 1n, 2n);
check('getTrades pages', page.length === 2 && page[1].isBuy === false);
const chart = candles(history, l.virtualMas, 60);
check(
  'the chart ends at the final price (market cap)',
  chart.length > 0 && chart.at(-1)!.close === tradePrice(l.virtualMas, history.at(-1)!) * 1e9,
  `${chart.length} candle(s), last ${chart.at(-1)?.close.toFixed(2)} MAS`,
);

// ---- the Dusa pool -----------------------------------------------------------------------------
const pairs = readPairList(
  await read(DUSA.factory, 'getAllLBPairs', new Args().addString(token).addString(DUSA.wmas)),
);
check(
  'the Factory lists the pool',
  pairs.some((p) => p.pair === l.pair && p.binStep === l.binStep),
);
const [x] = await provider.readStorage(l.pair, [new TextEncoder().encode('TOKEN_X')], false);
check('the token is X, WMAS is Y', new TextDecoder().decode(x!) === token);
const state = readPairState(await read(l.pair, 'getPairInformation'));
const price = Number(poolMas) / Number(POOL_TOKENS);
const expectedId = Math.floor(Math.log(price) / Math.log(1 + l.binStep / 10_000)) + 2 ** 23;
check(
  'the pool is at the curve’s final price',
  Math.abs(state.activeId - expectedId) <= 1,
  `bin ${state.activeId}, expected ${expectedId} (${price.toExponential(4)} MAS per token)`,
);
check(
  'the pool holds the 200 M tokens and the MAS',
  state.reserveX >= (POOL_TOKENS * 99n) / 100n && state.reserveY >= (poolMas * 99n) / 100n,
  `${state.reserveX / MAS} tokens, ${mas(state.reserveY)} (pool MAS ${mas(poolMas)})`,
);
const leftover = await tokenBalance(token, FAIR);
check('no tokens left in the Fair Launch', leftover <= POOL_TOKENS / 100n, `${leftover} units`);
const [bins] = await provider.readStorage(
  l.pair,
  [new TextEncoder().encode(`deposited_bins::${FAIR}`)],
  false,
);
console.log(
  `  liquidity owner: ${bins?.length ? `the Fair Launch holds ${bins.length / 4} bins` : 'deposited_bins key not found'}`,
);

// ---- fees withdrawal ----------------------------------------------------------------------------
const toWithdraw = await fees();
before = await myBalance();
await send(FAIR, 'withdrawFees', new Args(), 0n);
const withdrawn = (await myBalance()) - before;
check('withdrawFees pays the admin', withdrawn > toWithdraw - MAS / 10n, mas(withdrawn));
check('no fees left', (await fees()) === 0n);
check('withdrawing moved only the fees', (await rest()) === restAfter);

console.log(
  `\nSpent: ${mas(spentAtStart - (await myBalance()))} (pool MAS locked: ${mas(poolMas)})`,
);
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
