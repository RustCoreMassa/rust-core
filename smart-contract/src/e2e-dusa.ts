// End-to-end check of the app's Dusa code on buildnet (Dusa Core V2): launch a token through the
// Launchpad, create its TOKEN/WMAS pool at a chosen price, add token + MAS with the app's
// arguments, then read the pool back the way the app does. Measures what creating a pool costs
// (CREATE_PAIR_COINS in src/app/core/dusa/dusa.ts).
//   DEPLOYMENT=buildnet-1.6.0 npx tsx src/e2e-dusa.ts
// The account is PRIVATE_KEY (test MAS). Never on mainnet.
import 'dotenv/config';
import { readFileSync } from 'fs';
import {
  Account,
  Args,
  JsonRpcProvider,
  Mas,
  Operation,
  OperationStatus,
} from '@massalabs/massa-web3';
import { createTokenArgs, EMPTY_DRAFT } from '../../src/app/features/create/token-draft';
import { launchCost } from '../../src/app/core/launchpad/launch-cost';
import { ALLOWANCE_COINS } from '../../src/app/core/launchpad/presale-cost';
import { readConfig } from '../../src/app/core/launchpad/records';
import { contractReason, eventFields } from '../../src/app/core/launchpad/events';
import { NETWORKS } from '../../src/app/core/network/networks';
import {
  CREATE_PAIR_COINS,
  SHAPE_BINS,
  SLIPPAGE_BPS,
  WMAS_DECIMALS,
  addLiquidityCall,
  createPairArgs,
  idFromPrice,
  idSlippage,
  priceFromId,
  readPairList,
  readPairState,
  uniformDistribution,
} from '../../src/app/core/dusa/dusa';
import { deploymentFile } from './utils';

if (process.env['NETWORK'] === 'mainnet') throw new Error('e2e runs on buildnet only');
const DUSA = NETWORKS.buildnet.dusa!;
const LAUNCHPAD: string = JSON.parse(readFileSync(deploymentFile('buildnet'), 'utf8')).address;
const account = await Account.fromEnv();
const provider = JsonRpcProvider.buildnet(account);
const ME = account.address.toString();
const mas = (n: bigint) => `${n < 0n ? '-' : ''}${Mas.toString(n < 0n ? -n : n)} MAS`;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function read(target: string, func: string, args = new Args()) {
  const result = await provider.readSC({ target, func, parameter: args, caller: ME });
  if (result.info.error) throw new Error(result.info.error);
  return result.value;
}

async function send(target: string, func: string, args: Args, coins: bigint) {
  const sim = await provider.readSC({ target, func, parameter: args, coins, caller: ME });
  if (sim.info.error) throw new Error(`${func} simulation: ${contractReason(sim.info.error)}`);
  const op: Operation = await provider.callSC({ target, func, parameter: args, coins });
  const status = await op.waitFinalExecution();
  const events = (await op.getFinalEvents()).map((e) => e.data);
  if (status !== OperationStatus.Success)
    throw new Error(`${func} failed: ${contractReason(events.at(-1) ?? '')}`);
  return events;
}

async function refusal(target: string, func: string, args: Args, coins: bigint) {
  const sim = await provider.readSC({ target, func, parameter: args, coins, caller: ME });
  return sim.info.error ? contractReason(sim.info.error) : '';
}

// ---- a token: 1 000 000 units of 9 decimals --------------------------------------------------
const config = readConfig(new Args(await read(LAUNCHPAD, 'config')));
const [code] = await provider.readStorage(
  LAUNCHPAD,
  [new Uint8Array([...new TextEncoder().encode('tpl:'), 0, 0, 0, 0, 1])],
  true,
);
const symbol =
  'D' +
  Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, 'X');
const launched = await send(
  LAUNCHPAD,
  'createToken',
  createTokenArgs({ ...EMPTY_DRAFT, name: 'Dusa Test', symbol, decimals: 9, supply: '1000000' }),
  launchCost(config.tokenFee, config.deployDeposit, code!.length).total,
);
const [, token] = eventFields(launched, 'TOKEN_CREATED') ?? [];
console.log(`Token ${symbol} at ${token}`);

// ---- the pool: 0.001 MAS per token, bin step 20 (the only preset on buildnet) ---------------
const BIN_STEP = DUSA.binSteps[0];
const PRICE = 0.001;
const startId = idFromPrice(PRICE, BIN_STEP, 9, WMAS_DECIMALS)!;
const beforePair = await provider.balance(false);
await send(
  DUSA.router,
  'createLBPair',
  createPairArgs(token, DUSA.wmas, startId, BIN_STEP),
  CREATE_PAIR_COINS,
);
const pairCost = beforePair - (await provider.balance(false));
check(
  'pool created within CREATE_PAIR_COINS',
  pairCost > 0n && pairCost < CREATE_PAIR_COINS,
  `${mas(pairCost)} spent (sent ${mas(CREATE_PAIR_COINS)})`,
);
const list = readPairList(
  await read(DUSA.factory, 'getAllLBPairs', new Args().addString(token).addString(DUSA.wmas)),
);
check('the Factory lists it', list.length === 1 && list[0].binStep === BIN_STEP, list[0]?.pair);
const pair = list[0].pair;
const [x] = await provider.readStorage(pair, [new TextEncoder().encode('TOKEN_X')], false);
check('the token is X, WMAS is Y', new TextDecoder().decode(x!) === token);
const fresh = readPairState(await read(pair, 'getPairInformation'));
check('it starts at the chosen bin', fresh.activeId === startId, `${fresh.activeId}`);
check(
  'a second pool at the same bin step is refused',
  (await refusal(
    DUSA.router,
    'createLBPair',
    createPairArgs(token, DUSA.wmas, startId, BIN_STEP),
    CREATE_PAIR_COINS,
  )) !== '',
);

// ---- liquidity: 100 000 tokens and 50 MAS, narrow shape ----------------------------------------
const TOKENS = 100_000n * 10n ** 9n;
const MAS_IN = Mas.fromString('50');
await send(
  token,
  'increaseAllowance',
  new Args().addString(DUSA.router).addU256(TOKENS),
  ALLOWANCE_COINS,
);
const call = addLiquidityCall({
  token,
  wmas: DUSA.wmas,
  binStep: BIN_STEP,
  tokenAmount: TOKENS,
  masAmount: MAS_IN,
  activeId: startId,
  idSlippage: idSlippage(SLIPPAGE_BPS, BIN_STEP),
  distribution: uniformDistribution(SHAPE_BINS.narrow),
  to: ME,
  deadline: Date.now() + 20 * 60_000,
  slippageBps: SLIPPAGE_BPS,
});
const beforeAdd = await provider.balance(false);
await send(DUSA.router, 'addLiquidityMAS', call.args, call.coins);
const addCost = beforeAdd - (await provider.balance(false));
check(
  'liquidity added: MAS in + storage within what was sent',
  addCost >= MAS_IN && addCost <= call.coins,
  `${mas(addCost)} spent (sent ${mas(call.coins)})`,
);
const state = readPairState(await read(pair, 'getPairInformation'));
// Each bin takes floor(amount × share / 1e18): at most one smallest unit per bin stays out, and
// the router sends it back.
const bins = BigInt(2 * SHAPE_BINS.narrow + 1);
check(
  'the pool holds the tokens (less per-bin rounding)',
  state.reserveX <= TOKENS && TOKENS - state.reserveX <= bins,
  `${TOKENS - state.reserveX} unit(s) back`,
);
check(
  'the pool holds the MAS (less per-bin rounding)',
  state.reserveY <= MAS_IN && MAS_IN - state.reserveY <= bins,
  `${MAS_IN - state.reserveY} nanoMAS back`,
);
const price = priceFromId(state.activeId, BIN_STEP, 9, WMAS_DECIMALS);
check('its price is the one chosen', Math.abs(price / PRICE - 1) < 0.002, `${price}`);
const balance = new Args(await read(token, 'balanceOf', new Args().addString(ME))).nextU256();
check(
  'the wallet kept the rest of its tokens',
  balance === 1_000_000n * 10n ** 9n - state.reserveX,
);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
