import { Args, bytesToU64, stringToBytes, u32ToBytes } from '@massalabs/as-types';
import {
  Address,
  Storage,
  balanceOf as masBalanceOf,
  changeCallStack,
  mockAdminContext,
  mockBalance,
  mockScCall,
  mockTransferredCoins,
  resetStorage,
  setDeployContext,
} from '@massalabs/massa-as-sdk';
import {
  acceptAdmin,
  admin,
  buy,
  config,
  constructor,
  count,
  createLaunch,
  fees,
  getLaunch,
  getLaunches,
  getLaunchesBy,
  graduate,
  launchOfToken,
  quoteBuyOf,
  quoteSellOf,
  sell,
  setConfig,
  setHidden,
  TOKEN_TRANSFER_DEPOSIT,
  transferAdmin,
  withdrawFees,
} from '../contracts/fair-launch';
import {
  KIND_TOKEN,
  symbolKey,
  templateCodeKey,
  templateHashKey,
  templateVersionKey,
} from '../lib/launchpad/keys';
import { ProjectInfo } from '../lib/launchpad/records';
import { CURVE_TOKENS, feeOf, quoteBuy, virtualMasFor } from '../lib/fairlaunch/curve';
import {
  FairConfig,
  Launch,
  STATE_COMPLETE,
  STATE_GRADUATED,
  STATE_TRADING,
} from '../lib/fairlaunch/records';

const FAIR = 'AS12BqZEQ6sByhRLyEuf0YbQmcF2PsDdkNNG1akBJu9XcjZA1eT';
const LAUNCHPAD = 'AS12rFvAEoLamej3EM4FugHpXrsEyhDmpMkJPsUyCikH8AeGfPGTg';
const ROUTER = 'AS1xed5qTFcsWR2Ce7VLaAEHde8bJiTrX8JHM35qkHjmnqH1GFU8';
const FACTORY = 'AS12w3vcEYn8VBX1utw1fSmFNbYv9vMvy5n8tqCJjoGz3vaQYEhfp';
const WMAS = 'AS12FW5Rs5YN2zdpEnqwj4iHUUPt9R4Eqjq2qtpJFNKW3mn33RuLU';
const PAIR = 'AS1ExternalExternalExternalExternalExternalExtern1';
const OTHER_PAIR = 'AS127Lxdux4HCUkZL89SrRYR5kq2u8t64Jt3aYj786t6fBF1cZGcu';
const ADMIN = 'AU12UBnqTHDQALpocVBnkPNy7y5CndUJQTLutaVDDFgMJcq5kQiKq';
const ALICE = 'AU12BqZEQ6sByhRLyEuf0YbQmcF2PsDdkNNG1akBJu9XcjZA1e8';
const BOB = 'AUDeadBeefDeadBeefDeadBeefDeadBeefDeadBeefDeadBOObs';

const MAS: u64 = 1_000_000_000;
const CREATION_FEE: u64 = 2 * MAS;
const TRADE_FEE_BPS: u16 = 100; // 1 %
const GRADUATION_FEE_BPS: u16 = 200; // 2 %
const TARGET: u64 = 1_000 * MAS;
const DEPOSIT: u64 = MAS / 10;
const AUTO_GAS: u64 = 1_000_000_000;
/** What the vm-mock answers for any deferred call quote. */
const MOCK_QUOTE: u64 = 123_456_789;
const TOKEN_CODE: StaticArray<u8> = [0, 97, 115, 109, 7];

function testConfig(
  paused: bool = false,
  autoGas: u64 = AUTO_GAS,
  steps: u32[] = [20, 50],
): FairConfig {
  return new FairConfig(
    CREATION_FEE,
    TRADE_FEE_BPS,
    GRADUATION_FEE_BPS,
    TARGET,
    DEPOSIT,
    LAUNCHPAD,
    ROUTER,
    FACTORY,
    WMAS,
    steps,
    autoGas,
    paused,
  );
}

function callAs(user: string): void {
  changeCallStack(user + ' , ' + FAIR);
}

/** `user` calls with `sent` MAS; the contract holds funds of its own (the vm-mock doesn't credit it). */
function pay(user: string, sent: u64): void {
  mockBalance(FAIR, 100_000 * MAS);
  mockBalance(user, 10_000 * MAS);
  callAs(user);
  mockTransferredCoins(sent);
}

function done(): void {
  mockTransferredCoins(0);
}

/** The Launchpad's token template (version 1), as the Fair Launch reads it. */
function launchpadTemplate(): void {
  const lp = new Address(LAUNCHPAD);
  Storage.setOf(lp, templateVersionKey(KIND_TOKEN), u32ToBytes(1));
  Storage.setOf(lp, templateCodeKey(KIND_TOKEN, 1), TOKEN_CODE);
  Storage.setOf<StaticArray<u8>>(lp, templateHashKey(KIND_TOKEN, 1), [9, 9, 9]);
}

function deploy(cfg: FairConfig = testConfig()): void {
  resetStorage();
  launchpadTemplate();
  setDeployContext(ADMIN);
  constructor(new Args().add(cfg).serialize());
  mockAdminContext(false);
}

function info(): ProjectInfo {
  return new ProjectInfo('To the moon, fairly', 'ipfs://bafyLogo', '', '', '', '', '');
}

function launchArgs(symbol: string, devBuy: u64 = 0, minTokens: u64 = 0): StaticArray<u8> {
  return new Args().add('Fair Crab').add(symbol).add(info()).add(devBuy).add(minTokens).serialize();
}

/** Alice launches `symbol` (with an optional dev buy); returns the launch. */
function aliceLaunches(symbol: string = 'CRAB', devBuy: u64 = 0): Launch {
  pay(ALICE, CREATION_FEE + DEPOSIT + devBuy + devBuy / 50 + MAS);
  mockScCall([]); // the token's constructor
  mockScCall([]); // renounceOwnership
  if (devBuy > 0) mockScCall([]); // transfer of the dev buy
  createLaunch(launchArgs(symbol, devBuy));
  done();
  return launch(bytesToU64(count([])));
}

function launch(id: u64): Launch {
  return new Args(getLaunch(new Args().add(id).serialize())).nextSerializable<Launch>().unwrap();
}

function buyAs(user: string, id: u64, mas: u64, minTokens: u64 = 0): void {
  pay(user, mas + mas / 50 + MAS);
  mockScCall([]); // token transfer
  buy(new Args().add(id).add(mas).add(minTokens).serialize());
  done();
}

function sellAs(user: string, id: u64, tokens: u64, minMas: u64 = 0): void {
  pay(user, MAS);
  mockScCall([]); // transferFrom
  sell(new Args().add(id).add(tokens).add(minMas).serialize());
  done();
}

function accrued(): u64 {
  return new Args(fees([])).nextU64().unwrap();
}

/** Factory.getAllLBPairs answer: one (binStep, pair) entry per item. */
function pairList(steps: u32[], pairs: string[]): StaticArray<u8> {
  const args = new Args();
  for (let i = 0; i < steps.length; i++) args.add(steps[i]).add(pairs[i]).add(false).add(false);
  return args.serialize();
}

/** Bob buys out the curve of launch `id` (a buy much larger than needed). */
function sellOut(id: u64): void {
  buyAs(BOB, id, 2 * TARGET);
}

describe('Deployment', () => {
  test('the deployer is the admin and the config is stored', () => {
    deploy();
    expect(Storage.get(stringToBytes('admin'))).toStrictEqual(stringToBytes(ADMIN));
    expect(admin([])).toStrictEqual(stringToBytes(ADMIN));
    const cfg = new Args(config([])).nextSerializable<FairConfig>().unwrap();
    expect(cfg.targetMas).toBe(TARGET);
    expect(cfg.binSteps).toStrictEqual([20, 50]);
    expect(bytesToU64(count([]))).toBe(0);
  });

  throws('a trade fee above 2 %', () => {
    const cfg = testConfig();
    cfg.tradeFeeBps = 201;
    deploy(cfg);
  });

  throws('a graduation fee above 5 %', () => {
    const cfg = testConfig();
    cfg.graduationFeeBps = 501;
    deploy(cfg);
  });

  throws('a target below 100 MAS', () => {
    const cfg = testConfig();
    cfg.targetMas = 99 * MAS;
    deploy(cfg);
  });

  throws('no bin step', () => {
    deploy(testConfig(false, AUTO_GAS, []));
  });

  throws('an invalid Dusa router', () => {
    const cfg = testConfig();
    cfg.dusaRouter = 'nope';
    deploy(cfg);
  });
});

describe('Creating a launch', () => {
  test('deploys the token, records the launch and charges the fee', () => {
    deploy();
    const l = aliceLaunches();
    expect(l.id).toBe(1);
    expect(l.creator).toBe(ALICE);
    expect(l.symbol).toBe('CRAB');
    expect(l.templateVersion).toBe(1);
    expect(l.templateHash).toStrictEqual([9, 9, 9]);
    expect(l.virtualMas).toBe(virtualMasFor(TARGET));
    expect(l.tradeFeeBps).toBe(TRADE_FEE_BPS);
    expect(l.state).toBe(STATE_TRADING);
    expect(l.sold).toBe(0);
    expect(l.info.description).toBe('To the moon, fairly');
    expect(accrued()).toBe(CREATION_FEE);
    const byToken = new Args(launchOfToken(new Args().add(l.token).serialize())).nextU64().unwrap();
    expect(byToken).toBe(1);
    const mine = new Args(getLaunchesBy(new Args().add(ALICE).serialize()))
      .nextFixedSizeArray<u64>()
      .unwrap();
    expect(mine).toStrictEqual([1]);
  });

  test('a dev buy fills the curve at once', () => {
    deploy();
    const l = aliceLaunches('CRAB', 10 * MAS);
    expect(l.masIn).toBe(10 * MAS);
    expect(l.sold).toBe(quoteBuy(virtualMasFor(TARGET), 0, 0, 10 * MAS).tokens);
    expect(accrued()).toBe(CREATION_FEE + feeOf(10 * MAS, TRADE_FEE_BPS));
  });

  test('pages of launches, newest first', () => {
    deploy();
    aliceLaunches('AAA');
    aliceLaunches('BBB');
    aliceLaunches('CCC');
    const page = new Args(getLaunches(new Args().add(u64(0)).add(u32(2)).serialize()))
      .nextSerializableObjectArray<Launch>()
      .unwrap();
    expect(page.length).toBe(2);
    expect(page[0].symbol).toBe('CCC');
    expect(page[1].symbol).toBe('BBB');
    const next = new Args(getLaunches(new Args().add(u64(2)).add(u32(10)).serialize()))
      .nextSerializableObjectArray<Launch>()
      .unwrap();
    expect(next.length).toBe(1);
    expect(next[0].symbol).toBe('AAA');
  });

  throws('without the creation fee', () => {
    deploy();
    pay(ALICE, CREATION_FEE - 1);
    mockScCall([]);
    mockScCall([]);
    createLaunch(launchArgs('CRAB'));
  });

  throws('a symbol already launched here', () => {
    deploy();
    aliceLaunches('CRAB');
    aliceLaunches('CRAB');
  });

  throws('a symbol taken in the Launchpad', () => {
    deploy();
    Storage.setOf(new Address(LAUNCHPAD), symbolKey('RUST'), new StaticArray<u8>(0));
    aliceLaunches('RUST');
  });

  throws('a reserved symbol', () => {
    deploy();
    aliceLaunches('WMAS');
  });

  throws('an invalid symbol', () => {
    deploy();
    aliceLaunches('crab!');
  });

  throws('while paused', () => {
    deploy(testConfig(true));
    aliceLaunches();
  });

  throws('when the Launchpad has no token template', () => {
    resetStorage();
    setDeployContext(ADMIN);
    constructor(new Args().add(testConfig()).serialize());
    mockAdminContext(false);
    aliceLaunches();
  });

  throws('a dev buy below its minimum', () => {
    deploy();
    pay(ALICE, 100 * MAS);
    mockScCall([]);
    mockScCall([]);
    mockScCall([]);
    createLaunch(launchArgs('CRAB', 10 * MAS, CURVE_TOKENS));
  });
});

describe('Trading on the curve', () => {
  test('a buy moves the curve and pays the fee', () => {
    deploy();
    aliceLaunches();
    buyAs(BOB, 1, 50 * MAS);
    const l = launch(1);
    expect(l.masIn).toBe(50 * MAS);
    expect(l.sold).toBe(quoteBuy(l.virtualMas, 0, 0, 50 * MAS).tokens);
    expect(accrued()).toBe(CREATION_FEE + feeOf(50 * MAS, TRADE_FEE_BPS));
  });

  test('the quotes match what a buy and a sell do', () => {
    deploy();
    aliceLaunches();
    const quote = new Args(
      quoteBuyOf(
        new Args()
          .add(u64(1))
          .add(20 * MAS)
          .serialize(),
      ),
    );
    const tokens = quote.nextU64().unwrap();
    expect(quote.nextU64().unwrap()).toBe(20 * MAS);
    expect(quote.nextU64().unwrap()).toBe(feeOf(20 * MAS, TRADE_FEE_BPS));
    buyAs(BOB, 1, 20 * MAS);
    expect(launch(1).sold).toBe(tokens);
    const sq = new Args(quoteSellOf(new Args().add(u64(1)).add(tokens).serialize()));
    const net = sq.nextU64().unwrap();
    const fee = sq.nextU64().unwrap();
    expect(net + fee <= 20 * MAS).toBe(true);
    expect(net + fee > 20 * MAS - 10).toBe(true);
  });

  test('a sell pays the seller and moves the curve back', () => {
    deploy();
    aliceLaunches();
    buyAs(BOB, 1, 100 * MAS);
    const bought = launch(1).sold;
    const feesBefore = accrued();
    sellAs(BOB, 1, bought / 2);
    const l = launch(1);
    expect(l.sold).toBe(bought - bought / 2);
    const gross = 100 * MAS - l.masIn;
    expect(accrued()).toBe(feesBefore + feeOf(gross, TRADE_FEE_BPS));
    // Bob had 10 000 MAS mocked before the sell; he receives the net MAS (the vm-mock's own
    // coin bookkeeping moves the 0.01 MAS token deposit around, hence the margin).
    const net = gross - feeOf(gross, TRADE_FEE_BPS);
    const received = masBalanceOf(BOB) - 10_000 * MAS;
    expect(received >= net - TOKEN_TRANSFER_DEPOSIT && received <= net + MAS).toBe(true);
  });

  throws('a buy below its minimum tokens', () => {
    deploy();
    aliceLaunches();
    buyAs(BOB, 1, MAS, CURVE_TOKENS);
  });

  throws('a buy without enough MAS sent', () => {
    deploy();
    aliceLaunches();
    pay(BOB, 10 * MAS);
    mockScCall([]);
    buy(
      new Args()
        .add(u64(1))
        .add(10 * MAS)
        .add(u64(0))
        .serialize(),
    );
  });

  throws('a buy while paused', () => {
    deploy();
    aliceLaunches();
    callAs(ADMIN);
    setConfig(new Args().add(testConfig(true)).serialize());
    buyAs(BOB, 1, MAS);
  });

  test('sells keep working while paused', () => {
    deploy();
    aliceLaunches();
    buyAs(BOB, 1, 10 * MAS);
    callAs(ADMIN);
    setConfig(new Args().add(testConfig(true)).serialize());
    const bought = launch(1).sold;
    sellAs(BOB, 1, bought / 2);
    expect(launch(1).sold).toBe(bought - bought / 2);
  });

  throws('selling more than the curve sold', () => {
    deploy();
    aliceLaunches();
    buyAs(BOB, 1, MAS);
    sellAs(BOB, 1, launch(1).sold + 1);
  });

  throws('a sell below its minimum MAS', () => {
    deploy();
    aliceLaunches();
    buyAs(BOB, 1, 10 * MAS);
    sellAs(BOB, 1, launch(1).sold, 10 * MAS);
  });

  throws('an unknown launch', () => {
    deploy();
    buyAs(BOB, 7, MAS);
  });
});

describe('Selling out', () => {
  test('the last buy completes the curve and books the graduation', () => {
    deploy();
    aliceLaunches();
    sellOut(1);
    const l = launch(1);
    expect(l.sold).toBe(CURVE_TOKENS);
    expect(l.state).toBe(STATE_COMPLETE);
    expect(l.autoFee).toBe(MOCK_QUOTE);
    // The buyer paid only for what was left: about the target.
    expect(l.masIn > TARGET - MAS && l.masIn < TARGET + MAS).toBe(true);
  });

  test('no deferred call when auto-graduation is off', () => {
    deploy(testConfig(false, 0));
    aliceLaunches();
    sellOut(1);
    expect(launch(1).state).toBe(STATE_COMPLETE);
    expect(launch(1).autoFee).toBe(0);
  });

  throws('buying after the sell-out', () => {
    deploy();
    aliceLaunches();
    sellOut(1);
    buyAs(BOB, 1, MAS);
  });

  throws('selling after the sell-out', () => {
    deploy();
    aliceLaunches();
    sellOut(1);
    sellAs(BOB, 1, 1_000);
  });
});

describe('Graduation to Dusa', () => {
  test('creates the pool, adds the liquidity and keeps the graduation fee', () => {
    deploy();
    aliceLaunches();
    sellOut(1);
    const feesBefore = accrued();
    const raised = launch(1).masIn;
    pay(BOB, 0);
    mockScCall(pairList([], [])); // getAllLBPairs: no pool yet (bin step 20)
    mockScCall([]); // increaseAllowance
    mockScCall([]); // createLBPair
    mockScCall(pairList([20], [PAIR])); // getAllLBPairs: the new pool
    mockScCall([]); // addLiquidityMAS
    graduate(new Args().add(u64(1)).serialize());
    done();
    const l = launch(1);
    expect(l.state).toBe(STATE_GRADUATED);
    expect(l.pair).toBe(PAIR);
    expect(l.binStep).toBe(20);
    expect(l.masIn).toBe(0);
    expect(accrued()).toBe(feesBefore + feeOf(raised, GRADUATION_FEE_BPS));
  });

  test('skips a bin step whose pool is at another price', () => {
    deploy();
    aliceLaunches();
    sellOut(1);
    pay(BOB, 0);
    mockScCall(pairList([20], [OTHER_PAIR])); // a pool at bin step 20 exists…
    mockScCall(new Args().add(u32(1)).serialize()); // …at bin 1, far below the launch's price
    mockScCall(pairList([20], [OTHER_PAIR])); // bin step 50: free
    mockScCall([]); // increaseAllowance
    mockScCall([]); // createLBPair
    mockScCall(pairList([20, 50], [OTHER_PAIR, PAIR]));
    mockScCall([]); // addLiquidityMAS
    graduate(new Args().add(u64(1)).serialize());
    done();
    expect(launch(1).binStep).toBe(50);
    expect(launch(1).pair).toBe(PAIR);
  });

  throws('when every pool is at another price', () => {
    deploy();
    aliceLaunches();
    sellOut(1);
    pay(BOB, 0);
    mockScCall(pairList([20, 50], [OTHER_PAIR, PAIR]));
    mockScCall(new Args().add(u32(1)).serialize());
    mockScCall(pairList([20, 50], [OTHER_PAIR, PAIR]));
    mockScCall(new Args().add(u32(1)).serialize());
    graduate(new Args().add(u64(1)).serialize());
  });

  throws('before the curve sells out', () => {
    deploy();
    aliceLaunches();
    buyAs(BOB, 1, 10 * MAS);
    pay(BOB, 0);
    graduate(new Args().add(u64(1)).serialize());
  });

  throws('twice', () => {
    deploy();
    aliceLaunches();
    sellOut(1);
    pay(BOB, 0);
    mockScCall(pairList([], []));
    mockScCall([]);
    mockScCall([]);
    mockScCall(pairList([20], [PAIR]));
    mockScCall([]);
    graduate(new Args().add(u64(1)).serialize());
    graduate(new Args().add(u64(1)).serialize());
  });
});

describe('Admin', () => {
  test('withdraws only the fees', () => {
    deploy();
    aliceLaunches();
    buyAs(BOB, 1, 100 * MAS);
    const expected = accrued();
    pay(ADMIN, 0);
    mockBalance(ADMIN, 0);
    withdrawFees([]);
    expect(masBalanceOf(ADMIN)).toBe(expected);
    expect(accrued()).toBe(0);
    expect(launch(1).masIn).toBe(100 * MAS);
  });

  throws('withdrawing fees as someone else', () => {
    deploy();
    aliceLaunches();
    pay(BOB, 0);
    withdrawFees([]);
  });

  throws('changing the config as someone else', () => {
    deploy();
    callAs(BOB);
    setConfig(new Args().add(testConfig(true)).serialize());
  });

  test('a new config does not reach launches already created', () => {
    deploy();
    aliceLaunches();
    const cfg = testConfig();
    cfg.tradeFeeBps = 200;
    cfg.targetMas = 5_000 * MAS;
    callAs(ADMIN);
    setConfig(new Args().add(cfg).serialize());
    expect(launch(1).tradeFeeBps).toBe(TRADE_FEE_BPS);
    expect(launch(1).targetMas).toBe(TARGET);
  });

  test('hides a launch', () => {
    deploy();
    aliceLaunches();
    callAs(ADMIN);
    setHidden(new Args().add(u64(1)).add(true).serialize());
    expect(launch(1).hidden).toBe(true);
  });

  test('hands over the admin role in two steps', () => {
    deploy();
    callAs(ADMIN);
    transferAdmin(new Args().add(BOB).serialize());
    callAs(BOB);
    acceptAdmin([]);
    expect(admin([])).toStrictEqual(stringToBytes(BOB));
  });

  throws('accepting the admin role uninvited', () => {
    deploy();
    callAs(ADMIN);
    transferAdmin(new Args().add(BOB).serialize());
    callAs(ALICE);
    acceptAdmin([]);
  });
});

// Bytes for the app's cross-check (src/app/core/fairlaunch/records.spec.ts): a Launch record and
// the config, as the contract writes them. Regenerate them there when a record changes.
describe('Encoding for the app', () => {
  test('logs a launch record and the config', () => {
    deploy();
    aliceLaunches('XCHK', 5 * MAS);
    log<string>('FAIR_LAUNCH_BYTES ' + getLaunch(new Args().add(u64(1)).serialize()).toString());
    log<string>('FAIR_CONFIG_BYTES ' + config([]).toString());
  });
});
