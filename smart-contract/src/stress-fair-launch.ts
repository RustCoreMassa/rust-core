// Load test of the Fair Launch on buildnet: one new launch, then WALLETS generated accounts trade
// it side by side, each pausing PAUSE_MIN–PAUSE_MAX seconds (default 30–60) between its trades,
// until TRADES buys and sells have gone through; then the script checks that the contract kept
// every trade and stayed consistent:
//   - Launch.trades = the trades that went through, and getTrades pages back all of them;
//   - each trade follows the curve (the app's mirror) from the state the previous one left;
//   - the fees grew by the creation fee + the trade fee of each trade, nothing else;
//   - each wallet holds exactly the tokens its trades add up to, the contract the rest;
//   - the contract's balance = fees + MAS in the curves + a constant, as before the test;
//   - the app's chart and trade list can be built from it (time to read the whole history).
// The curve is kept below its target (no sell-out), the launch stays open for the app. Trades
// accept any price (minimums 0): with this many traders at once, prices move between a quote
// and its block. At the end the wallets send their MAS back to PRIVATE_KEY. Their keys are kept in
// .stress/wallets-<launch>.json (git-ignored): if a run stops early, SWEEP=<that file> sends
// their MAS back.
//   TRADES=1000 WALLETS=30 npx tsx src/stress-fair-launch.ts
//   SWEEP=.stress/wallets-8.json npx tsx src/stress-fair-launch.ts
// Costs ≈ 0.04 MAS a trade (operation fee, the trade's storage, its 1 % fee) plus the launch.
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import {
  Account,
  Args,
  JsonRpcProvider,
  Mas,
  PublicAPI,
  PublicApiUrl,
  StorageCost,
} from '@massalabs/massa-web3';
import { contractReason, eventFields } from '../../src/app/core/launchpad/events';
import { EMPTY_INFO, writeInfo } from '../../src/app/core/launchpad/records';
import {
  CREATE_MARGIN,
  CURVE_TOKENS,
  TOTAL_SUPPLY,
  TRADE_MARGIN,
  buyCoins,
  feeOf,
  quoteBuy,
  quoteSell,
} from '../../src/app/core/fairlaunch/curve';
import {
  Launch,
  STATE_COMPLETE,
  STATE_TRADING,
  Trade,
  readFairConfig,
  readLaunch,
  readTradeList,
} from '../../src/app/core/fairlaunch/records';
import { candles } from '../../src/app/core/fairlaunch/chart';

if (process.env['NETWORK'] === 'mainnet') throw new Error('Load tests run on buildnet only');
const TRADES = Number(process.env['TRADES'] ?? '1000');
const WALLETS = Number(process.env['WALLETS'] ?? '30');
const PAUSE_MIN = Number(process.env['PAUSE_MIN'] ?? '30');
const PAUSE_MAX = Math.max(PAUSE_MIN, Number(process.env['PAUSE_MAX'] ?? '60'));
const FAIR: string = JSON.parse(
  readFileSync(
    `deployments/${process.env['FAIR_DEPLOYMENT'] || 'fair-launch-buildnet'}.json`,
    'utf8',
  ),
).address;
const MAS = 1_000_000_000n;
const FUND = 60n * MAS;
const main = await Account.fromEnv();
const provider = JsonRpcProvider.buildnet(main);
const api = new PublicAPI(PublicApiUrl.Buildnet);
// The public node sometimes answers with an HTML error page under load; whatever massa-web3 drops
// that way must not end the run.
process.on('unhandledRejection', (err) => console.log(`  (network) ${String(err).slice(0, 90)}`));
const ME = main.address.toString();
const mas = (n: bigint) => `${n < 0n ? '-' : ''}${Mas.toString(n < 0n ? -n : n)} MAS`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const started = Date.now();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)} s`;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** A transient network error (rate limit, an HTML error page, a timeout) is retried. */
async function retry<T>(run: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (err) {
      if (i >= tries) throw err;
      await sleep(2_000 * i);
    }
  }
}

/**
 * Operations in flight, all checked by one poller: one get_operations call every 2 s instead of
 * one poll per operation (the public node limits requests). Resolves with the speculative
 * execution's outcome, or null after 3 minutes without one.
 */
const waiting = new Map<string, { resolve: (ok: boolean | null) => void; since: number }>();
let polling = true;
const poller = (async () => {
  while (polling) {
    await sleep(2_000);
    const ids = [...waiting.keys()];
    for (let i = 0; i < ids.length; i += 50) {
      const infos = await api.getOperations(ids.slice(i, i + 50)).catch(() => []);
      for (const info of infos) {
        if (info.op_exec_status === null || info.op_exec_status === undefined) continue;
        waiting.get(info.id)?.resolve(info.op_exec_status);
        waiting.delete(info.id);
      }
    }
    for (const [id, w] of waiting)
      if (Date.now() - w.since > 180_000) {
        w.resolve(null);
        waiting.delete(id);
      }
  }
})();
const executed = (opId: string) =>
  new Promise<boolean | null>((resolve) => waiting.set(opId, { resolve, since: Date.now() }));

/** Runs `tasks` five at a time. */
async function inBatches<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tasks.length; i += 5) {
    out.push(...(await Promise.all(tasks.slice(i, i + 5).map((t) => t()))));
    await sleep(1_000);
  }
  return out;
}

async function read(target: string, func: string, args = new Args()) {
  const result = await retry(() => provider.readSC({ target, func, parameter: args, caller: ME }));
  if (result.info.error) throw new Error(`${func}: ${contractReason(result.info.error)}`);
  return result.value;
}

const idArgs = (id: bigint) => new Args().addU64(id);
const getLaunch = async (id: bigint): Promise<Launch> =>
  readLaunch(new Args(await read(FAIR, 'getLaunch', idArgs(id))));
const fees = async () => new Args(await read(FAIR, 'fees')).nextU64();
const tokenBalance = async (token: string, holder: string) =>
  new Args(await read(token, 'balanceOf', new Args().addString(holder))).nextU256();

async function rest(): Promise<bigint> {
  const count = new Args(await read(FAIR, 'count')).nextU64();
  let escrow = 0n;
  for (let id = 1n; id <= count; id++) {
    const l = await getLaunch(id);
    if (l.state === STATE_TRADING) escrow += l.masIn;
    else if (l.state === STATE_COMPLETE) escrow += l.masIn - l.autoFee;
  }
  const [entry] = await retry(() => provider.balanceOf([FAIR], false));
  return entry.balance - (await fees()) - escrow;
}

async function allTrades(id: bigint, total: bigint): Promise<Trade[]> {
  const out: Trade[] = [];
  while (BigInt(out.length) < total) {
    const page = readTradeList(
      await read(FAIR, 'getTrades', idArgs(id).addU64(BigInt(out.length)).addU32(100n)),
    );
    if (!page.length) break;
    out.push(...page);
  }
  return out;
}

/** Sends a call from `p` and waits for its block; returns its events, or why it failed. */
async function call(
  p: JsonRpcProvider,
  target: string,
  func: string,
  args: Args,
  coins: bigint,
): Promise<{ ok: boolean; events: string[]; reason: string; unknown?: boolean }> {
  const op = await retry(() => p.callSC({ target, func, parameter: args, coins }));
  const ok = await executed(op.id);
  if (ok === null)
    return { ok: false, events: [], reason: 'no answer in 3 minutes', unknown: true };
  const events = (await retry(() => api.getEvents({ operationId: op.id }))).map((e) => e.data);
  return { ok, events, reason: ok ? '' : contractReason(events.at(-1) ?? 'failed') };
}

/** Sends what `accounts` hold back to PRIVATE_KEY (keeps each one's operation fee). */
async function sweep(accounts: Account[]): Promise<bigint> {
  const amounts = await inBatches(
    accounts.map((account) => async () => {
      const p = JsonRpcProvider.buildnet(account);
      const balance = await retry(() => p.balance(false));
      const amount = balance - MAS / 50n;
      if (amount <= 0n) return 0n;
      // massa-web3 checks the final balance, up to ~45 s behind: retried until it has caught up.
      const op = await retry(() => p.transfer(ME, amount), 12);
      return (await executed(op.id)) ? amount : 0n;
    }),
  );
  return amounts.reduce((a, b) => a + b, 0n);
}

if (process.env['SWEEP']) {
  const keys: string[] = JSON.parse(readFileSync(process.env['SWEEP'], 'utf8')).keys;
  const accounts = await Promise.all(keys.map((k) => Account.fromPrivateKey(k)));
  console.log(`Back from ${accounts.length} wallets: ${mas(await sweep(accounts))}`);
  process.exit(0);
}

// ---- the launch -------------------------------------------------------------------------------
const config = readFairConfig(new Args(await read(FAIR, 'config')));
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
const fees0 = await fees();
const mainBefore = await provider.balance(false);
const symbol =
  'LD' +
  Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, 'X');
const created = await call(
  provider,
  FAIR,
  'createLaunch',
  writeInfo(new Args().addString('Load Test').addString(symbol), {
    ...EMPTY_INFO,
    description: `${TRADES} buys and sells by ${WALLETS} wallets at once (stress-fair-launch).`,
  })
    .addU64(0n)
    .addU64(0n),
  config.creationFee +
    config.deployDeposit +
    StorageCost.smartContractDeploy(code!.length) +
    CREATE_MARGIN,
);
if (!created.ok) throw new Error(`createLaunch failed: ${created.reason}`);
const [idText, token] = eventFields(created.events, 'LAUNCH_CREATED') ?? [];
const id = BigInt(idText);
const virtualMas = config.targetMas / 3n;
const minutes = Math.round(((TRADES / WALLETS) * ((PAUSE_MIN + PAUSE_MAX) / 2 + 12)) / 60);
console.log(
  `${TRADES} trades by ${WALLETS} wallets, ${PAUSE_MIN}–${PAUSE_MAX} s apart each: about ${minutes} min`,
);
console.log(`Launch #${id} ${symbol} at ${token} (${elapsed()})`);

// ---- the wallets ------------------------------------------------------------------------------
const wallets = await Promise.all(
  Array.from({ length: WALLETS }, async () => {
    const account = await Account.generate();
    return { account, provider: JsonRpcProvider.buildnet(account), held: 0n, trades: 0 };
  }),
);
const addresses = wallets.map((w) => w.account.address.toString());
mkdirSync('.stress', { recursive: true });
const keyFile = `.stress/wallets-${id}.json`;
writeFileSync(
  keyFile,
  JSON.stringify(
    {
      network: 'buildnet',
      launch: Number(id),
      keys: wallets.map((w) => w.account.privateKey.toString()),
    },
    null,
    2,
  ),
);
console.log(`Wallet keys in ${keyFile} (SWEEP=${keyFile} sends their MAS back)`);
await inBatches(addresses.map((a) => () => retry(() => provider.transfer(a, FUND))));
// Final, not only executed: massa-web3 checks a sender's balance in the final state.
for (;;) {
  const infos = await retry(() => api.getMultipleAddressInfo(addresses));
  if (infos.every((i) => Mas.fromString(String(i.final_balance)) >= FUND - MAS / 100n)) break;
  await sleep(5_000);
}
const allowances = await inBatches(
  wallets.map(
    (w) => () =>
      call(
        w.provider,
        token,
        'increaseAllowance',
        new Args().addString(FAIR).addU256(10n ** 18n),
        20_000_000n,
      ),
  ),
);
check(
  `${WALLETS} wallets funded with ${mas(FUND)} and allowed the curve to take tokens back`,
  allowances.every((a) => a.ok),
  elapsed(),
);

// ---- the trading ------------------------------------------------------------------------------
let reserved = 0; // trades sent or done
let done = 0;
let refused = 0;
let unknown = 0;
const reasons = new Map<string, number>();
let lastMasIn = 0n;
const target = Number(config.targetMas);

const pause = () => (PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN)) * 1000;

async function trader(w: (typeof wallets)[number]): Promise<void> {
  await sleep(Math.random() * PAUSE_MAX * 1000); // the traders start at different times
  let failedInARow = 0;
  let first = true;
  while (reserved < TRADES && failedInARow < 5) {
    if (!first) await sleep(pause());
    first = false;
    if (reserved >= TRADES) break;
    reserved++;
    // Keep the curve between ~20 % and ~85 % of its target: never sell it out.
    const fill = Number(lastMasIn) / target;
    const buyChance = fill > 0.85 ? 0.15 : fill < 0.2 ? 0.85 : 0.55;
    const sellable = (w.held * BigInt(20 + Math.floor(Math.random() * 60))) / 100n;
    const isBuy = Math.random() < buyChance || sellable < MAS;
    let result;
    if (isBuy) {
      const amount = BigInt(Math.floor((0.1 + Math.random() * 2.9) * 100)) * (MAS / 100n);
      result = await call(
        w.provider,
        FAIR,
        'buy',
        idArgs(id).addU64(amount).addU64(0n),
        buyCoins(amount, config.tradeFeeBps),
      ).catch((err) => ({ ok: false, events: [], reason: String(err).slice(0, 80) }));
    } else {
      result = await call(
        w.provider,
        FAIR,
        'sell',
        idArgs(id).addU64(sellable).addU64(0n),
        TRADE_MARGIN,
      ).catch((err) => ({ ok: false, events: [], reason: String(err).slice(0, 80) }));
    }
    const fields = eventFields(result.events, isBuy ? 'BUY' : 'SELL');
    if (!result.ok || !fields) {
      reserved--;
      if ('unknown' in result && result.unknown) unknown++;
      else refused++;
      failedInARow++;
      reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
      continue;
    }
    failedInARow = 0;
    const tokens = BigInt(fields[3]);
    w.held += isBuy ? tokens : -tokens;
    w.trades++;
    lastMasIn = BigInt(fields[5]);
    done++;
    if (done % 50 === 0)
      console.log(
        `  ${done} trades, ${refused} refused, ${mas(lastMasIn)} in the curve (${elapsed()})`,
      );
  }
}

const tradingStarted = Date.now();
await Promise.all(wallets.map((w) => trader(w)));
const tradingSeconds = (Date.now() - tradingStarted) / 1000;
console.log(
  `Trading done: ${done} trades in ${Math.round(tradingSeconds)} s ` +
    `(${(done / tradingSeconds).toFixed(2)} a second), ${refused} refused`,
);
for (const [reason, n] of reasons) console.log(`  refused ${n}×: ${reason}`);
await sleep(5_000);

// ---- the checks -------------------------------------------------------------------------------
const l = await getLaunch(id);
// A trade whose answer never came may still have gone through.
check(
  'the launch counts every trade',
  l.trades >= BigInt(done) && l.trades <= BigInt(done + unknown),
  `${l.trades} recorded, ${done} seen${unknown ? `, ${unknown} without an answer` : ''}`,
);
check('it is still on the curve', l.state === STATE_TRADING && l.sold < CURVE_TOKENS);
const readStart = Date.now();
const history = await allTrades(id, l.trades);
const readMs = Date.now() - readStart;
check(
  'getTrades pages back the whole history',
  BigInt(history.length) === l.trades,
  `${history.length} trades read in ${readMs} ms (${Math.ceil(history.length / 100)} reads)`,
);

let sold = 0n;
let masIn = 0n;
let feeSum = config.creationFee;
let curveBreaks = 0;
let orderBreaks = 0;
const byTrader = new Map<string, bigint>();
history.forEach((t, i) => {
  const before = { virtualMas, masIn, sold };
  const expected = t.isBuy ? quoteBuy(before, t.mas).tokens : quoteSell(before, t.tokens);
  const matches = t.isBuy ? expected === t.tokens : expected === t.mas;
  sold += t.isBuy ? t.tokens : -t.tokens;
  masIn += t.isBuy ? t.mas : -t.mas;
  if (!matches || t.sold !== sold || t.masIn !== masIn) curveBreaks++;
  if (i > 0 && t.time < history[i - 1].time) orderBreaks++;
  feeSum += feeOf(t.mas, l.tradeFeeBps);
  byTrader.set(t.trader, (byTrader.get(t.trader) ?? 0n) + (t.isBuy ? t.tokens : -t.tokens));
});
check(
  'every trade follows the curve from the previous one',
  curveBreaks === 0,
  `${curveBreaks} out of line`,
);
check('times never go back', orderBreaks === 0);
check('the history ends at the launch’s curve', sold === l.sold && masIn === l.masIn);
check(
  'buys and sells both happened',
  history.some((t) => t.isBuy) && history.some((t) => !t.isBuy),
  `${history.filter((t) => t.isBuy).length} buys, ${history.filter((t) => !t.isBuy).length} sells`,
);
const feeGain = (await fees()) - fees0;
check('fees = creation fee + each trade’s fee', feeGain === feeSum, mas(feeGain));

let holdingBreaks = 0;
for (const w of wallets) {
  const address = w.account.address.toString();
  const onChain = await tokenBalance(token, address);
  if (onChain !== (byTrader.get(address) ?? 0n)) holdingBreaks++;
}
check(
  'each wallet holds what its trades add up to',
  holdingBreaks === 0,
  `${byTrader.size} traders`,
);
check(
  'the contract holds the rest of the supply',
  (await tokenBalance(token, FAIR)) === TOTAL_SUPPLY - l.sold,
);
check('balance = fees + curves (+ constant), as before', (await rest()) === rest0);
const chart = candles(history, l.virtualMas, 60);
check('the chart builds from it', chart.length > 0, `${chart.length} one-minute candles`);

// ---- the MAS back -----------------------------------------------------------------------------
const returned = await sweep(wallets.map((w) => w.account));
polling = false;
await poller;
console.log(`\nMAS back from the wallets: ${mas(returned)}`);
console.log(`Spent by ${ME}: ${mas(mainBefore - (await provider.balance(false)))} (${elapsed()})`);
console.log(`Launch #${id} stays open: ${l.trades} trades, ${mas(l.masIn)} in the curve`);
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
