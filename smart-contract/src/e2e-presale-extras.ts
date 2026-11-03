// End-to-end check of presale whitelists and vesting (Launchpad v1.6.0) on buildnet: a full
// batch of 200 addresses, an unlisted buyer refused before the public phase, a listed buyer up
// to the hard cap, the first vesting release claimed, a second claim refused until the next
// unlock, and the whitelist cleared after the presale (storage back to the owner).
//   DEPLOYMENT=buildnet-1.6.0 npx tsx src/e2e-presale-extras.ts
// The owner is PRIVATE_KEY; the buyers are generated and funded from it (test MAS). Never on
// mainnet. Later unlocks need a day per cycle: the unit tests cover them.
import 'dotenv/config';
import { readFileSync } from 'fs';
import {
  Account,
  Args,
  ArrayTypes,
  JsonRpcProvider,
  Mas,
  Operation,
  OperationStatus,
} from '@massalabs/massa-web3';
import { createTokenArgs, EMPTY_DRAFT } from '../../src/app/features/create/token-draft';
import { launchCost } from '../../src/app/core/launchpad/launch-cost';
import { whitelistCoins } from '../../src/app/core/launchpad/presale-cost';
import { claimable, unlockedBps } from '../../src/app/core/launchpad/presale-state';
import {
  PRESALE_SUCCESS,
  readConfig,
  readPresale,
  tokensFor,
} from '../../src/app/core/launchpad/records';
import { contractReason, eventFields } from '../../src/app/core/launchpad/events';
import { deploymentFile } from './utils';

if (process.env['NETWORK'] === 'mainnet') throw new Error('e2e runs on buildnet only');
const LAUNCHPAD: string = JSON.parse(readFileSync(deploymentFile('buildnet'), 'utf8')).address;
const ownerAccount = await Account.fromEnv();
const owner = JsonRpcProvider.buildnet(ownerAccount);
const buyerAccount = await Account.generate();
const buyer = JsonRpcProvider.buildnet(buyerAccount);
const strangerAccount = await Account.generate();
const stranger = JsonRpcProvider.buildnet(strangerAccount);
const OWNER = ownerAccount.address.toString();
const BUYER = buyerAccount.address.toString();
const STRANGER = strangerAccount.address.toString();
const mas = (n: bigint) => `${n < 0n ? '-' : ''}${Mas.toString(n < 0n ? -n : n)} MAS`;
const UNIT = 10n ** 9n;
const DAY = 86_400_000n;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function read(target: string, func: string, args = new Args(), caller = OWNER) {
  const result = await owner.readSC({ target, func, parameter: args, caller });
  if (result.info.error) throw new Error(result.info.error);
  return result.value;
}

async function send(who: JsonRpcProvider, target: string, func: string, args: Args, coins: bigint) {
  const sim = await who.readSC({ target, func, parameter: args, coins, caller: who.address });
  if (sim.info.error) throw new Error(`${func} simulation: ${contractReason(sim.info.error)}`);
  const op: Operation = await who.callSC({ target, func, parameter: args, coins });
  const status = await op.waitFinalExecution();
  const events = (await op.getFinalEvents()).map((e) => e.data);
  if (status !== OperationStatus.Success)
    throw new Error(`${func} failed: ${contractReason(events.at(-1) ?? '')}`);
  return { events, gas: sim.info.gasCost };
}

/** The contract's refusal of a call (simulated), or '' when it would pass. */
async function refusal(who: JsonRpcProvider, func: string, args: Args, coins: bigint) {
  const sim = await who.readSC({
    target: LAUNCHPAD,
    func,
    parameter: args,
    coins,
    caller: who.address,
  });
  return sim.info.error ? contractReason(sim.info.error) : '';
}

const tokenBalance = async (token: string, holder: string) =>
  new Args(await read(token, 'balanceOf', new Args().addString(holder))).nextU256();
const presale = async (id: bigint) =>
  readPresale(new Args(await read(LAUNCHPAD, 'getPresale', new Args().addU64(id))));

const version = new TextDecoder().decode(await read(LAUNCHPAD, 'version'));
if (version < '1.6.0') throw new Error(`Launchpad ${version}: whitelists need v1.6.0`);

// ---- a token to sell: 1 000 000 units of 9 decimals ------------------------------------------
for (const to of [BUYER, STRANGER]) {
  await (await owner.transfer(to, Mas.fromString('10'))).waitFinalExecution();
}
const config = readConfig(new Args(await read(LAUNCHPAD, 'config')));
const [code] = await owner.readStorage(
  LAUNCHPAD,
  [new Uint8Array([...new TextEncoder().encode('tpl:'), 0, 0, 0, 0, 1])],
  true,
);
const symbol =
  'W' +
  Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, 'X');
const launched = await send(
  owner,
  LAUNCHPAD,
  'createToken',
  createTokenArgs({
    ...EMPTY_DRAFT,
    name: 'Vesting Token',
    symbol,
    decimals: 9,
    supply: '1000000',
  }),
  launchCost(config.tokenFee, config.deployDeposit, code!.length).total,
);
const [, token] = eventFields(launched.events, 'TOKEN_CREATED') ?? [];
console.log(`Token ${symbol} at ${token}; buyer ${BUYER}; stranger ${STRANGER}`);

// ---- presale: whitelist for 1 hour, 25 % at the end then 25 % a day; hard cap 2 MAS ----------
const RATE = 1_000n * UNIT;
const HARD_CAP = Mas.fromString('2');
const FOR_SALE = tokensFor(HARD_CAP, RATE);
const start = BigInt(Date.now());
const end = start + 2n * 3_600_000n;
const publicFrom = start + 3_600_000n;
await send(
  owner,
  token,
  'increaseAllowance',
  new Args().addString(LAUNCHPAD).addU256(FOR_SALE),
  Mas.fromString('0.02'),
);
const created = await send(
  owner,
  LAUNCHPAD,
  'createPresale',
  new Args()
    .addString(token)
    .addU256(FOR_SALE)
    .addU256(RATE)
    .addU64(Mas.fromString('1'))
    .addU64(HARD_CAP)
    .addU64(0n)
    .addU64(0n)
    .addU64(start)
    .addU64(end)
    .addBool(true)
    .addU64(publicFrom)
    .addU16(2_500n)
    .addU64(DAY)
    .addU16(2_500n),
  Mas.fromString('0.2'),
);
const id = BigInt((eventFields(created.events, 'PRESALE_CREATED') ?? ['0'])[0]);
const p0 = await presale(id);
check(
  'created with its whitelist and vesting',
  p0.whitelist && p0.publicFrom === Number(publicFrom) && p0.vestFirstBps === 2_500,
  `presale ${id}`,
);

// ---- a full batch: 199 generated addresses + the buyer --------------------------------------
const batch: string[] = [BUYER];
for (let i = 0; i < 199; i++) batch.push((await Account.generate()).address.toString());
const ownerBeforeList = await owner.balance(true);
const added = await send(
  owner,
  LAUNCHPAD,
  'addToWhitelist',
  new Args().addU64(id).addArray(batch, ArrayTypes.STRING),
  whitelistCoins(batch.length),
);
const listCost = ownerBeforeList - (await owner.balance(true));
check('200 addresses in one call', (await presale(id)).whitelisted === 200, `gas ${added.gas}`);
check(
  'whitelist storage within the coins sent',
  listCost > 0n && listCost < whitelistCoins(200),
  `${mas(listCost)} (≈ ${mas(listCost / 200n)} each)`,
);
const listed = async (who: string) =>
  (await read(LAUNCHPAD, 'isWhitelisted', new Args().addU64(id).addString(who)))[0] === 1;
check('the buyer is listed', await listed(BUYER));
check('the stranger is not', !(await listed(STRANGER)));
check(
  'a batch of 201 is refused',
  (await refusal(
    owner,
    'addToWhitelist',
    new Args().addU64(id).addArray([...batch, STRANGER], ArrayTypes.STRING),
    whitelistCoins(201),
  )) === 'Send 1-200 addresses at a time',
);

// ---- contributions -----------------------------------------------------------------------------
check(
  'an unlisted address is refused before the public phase',
  (await refusal(
    stranger,
    'contribute',
    new Args().addU64(id).addU64(Mas.fromString('1')),
    Mas.fromString('1.05'),
  )) === 'Only the whitelist can contribute for now',
);
await send(
  buyer,
  LAUNCHPAD,
  'contribute',
  new Args().addU64(id).addU64(HARD_CAP),
  HARD_CAP + Mas.fromString('0.05'),
);
check('the listed buyer reached the hard cap', (await presale(id)).raised === HARD_CAP);

// ---- finalize early, claim the first release ----------------------------------------------------
await send(buyer, LAUNCHPAD, 'finalize', new Args().addU64(id), Mas.fromString('0.05'));
const done = await presale(id);
check(
  'finalized early: vesting counts from now',
  done.status === PRESALE_SUCCESS && done.finalizedAt > 0 && done.finalizedAt < done.end,
);
const expected = claimable(done, HARD_CAP, 0n, Date.now());
check('the app expects 25 %', unlockedBps(done, Date.now()) === 2_500);
await send(buyer, LAUNCHPAD, 'claim', new Args().addU64(id), Mas.fromString('0.05'));
const got = await tokenBalance(token, BUYER);
check(
  'the buyer got the first release',
  got === expected && got === FOR_SALE / 4n,
  `${got / UNIT}`,
);
const claimedSoFar = new Args(
  await read(LAUNCHPAD, 'getClaimed', new Args().addU64(id).addString(BUYER)),
).nextU256();
check('claimed so far is recorded', claimedSoFar === got);
check(
  'a second claim waits for the next unlock',
  (await refusal(buyer, 'claim', new Args().addU64(id), Mas.fromString('0.05'))) ===
    'Nothing to claim before the next unlock',
);
check(
  'the contribution stays until the last claim',
  new Args(
    await read(LAUNCHPAD, 'getContribution', new Args().addU64(id).addString(BUYER)),
  ).nextU64() === HARD_CAP,
);

// ---- after the presale: clear the whitelist, storage back to the owner -----------------------
const ownerBeforeClear = await owner.balance(true);
await send(
  owner,
  LAUNCHPAD,
  'removeFromWhitelist',
  new Args().addU64(id).addArray(batch, ArrayTypes.STRING),
  Mas.fromString('0.05'),
);
const back = (await owner.balance(true)) - ownerBeforeClear;
check('whitelist cleared', (await presale(id)).whitelisted === 0);
check('its storage came back to the owner', back > (listCost * 9n) / 10n, mas(back));
await send(owner, LAUNCHPAD, 'withdrawRaised', new Args().addU64(id), Mas.fromString('0.02'));
check('the owner withdrew the MAS raised', (await presale(id)).withdrawn);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
