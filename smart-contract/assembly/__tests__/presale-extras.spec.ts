// Presale whitelist and vesting (v1.6.0).
import { Args, bytesToU256, bytesToU64, stringToBytes, u256ToBytes } from '@massalabs/as-types';
import {
  Address,
  Storage,
  changeCallStack,
  mockAdminContext,
  mockBalance,
  mockScCall,
  mockTimestamp,
  mockTransferredCoins,
  resetStorage,
  setBytecodeOf,
  setDeployContext,
} from '@massalabs/massa-as-sdk';
import { u256 } from 'as-bignum/assembly';
import {
  addToWhitelist,
  cancelPresale,
  claim,
  constructor,
  contribute,
  createPresale,
  finalize,
  getClaimed,
  getContribution,
  getContributionsOf,
  getPresale,
  getPresales,
  importToken,
  isWhitelisted,
  removeFromWhitelist,
} from '../contracts/launchpad';
import { STD_OWNER_KEY, escrowedKey, presaleKey } from '../lib/launchpad/keys';
import { _share, _unlockedBps } from '../lib/launchpad/presale';
import { BPS_ALL, Config, Presale, ProjectInfo } from '../lib/launchpad/records';

const LAUNCHPAD = 'AS12BqZEQ6sByhRLyEuf0YbQmcF2PsDdkNNG1akBJu9XcjZA1eT';
const ADMIN = 'AU12UBnqTHDQALpocVBnkPNy7y5CndUJQTLutaVDDFgMJcq5kQiKq';
const ALICE = 'AU12BqZEQ6sByhRLyEuf0YbQmcF2PsDdkNNG1akBJu9XcjZA1e8';
const BOB = 'AUDeadBeefDeadBeefDeadBeefDeadBeefDeadBeefDeadBOObs';
const CAROL = 'AU1CarolCarolCarolCarolCarolCarolCarolCarolCarol12';
const DAVE = 'AU1DaveDaveDaveDaveDaveDaveDaveDaveDaveDaveDave1234';
const TOKEN = 'AS1ExternalExternalExternalExternalExternalExtern1';

const MAS: u64 = 1_000_000_000;
const HOUR: u64 = 60 * 60 * 1000;
const DAY: u64 = 24 * HOUR;
const NOW: u64 = 10_000_000;
const START: u64 = NOW + HOUR;
const END: u64 = START + 24 * HOUR;
const PUBLIC: u64 = START + 12 * HOUR;
const UNIT: u256 = u256.fromU64(1_000_000_000_000_000_000);
/** 1 000 tokens (18 decimals) per MAS. */
const RATE: u256 = u256.fromU64(1_000) * UNIT;
/** Enough for the 100 MAS hard cap: 100 000 tokens. */
const FOR_SALE: u256 = u256.fromU64(100_000) * UNIT;
const MONTH: u64 = 30 * DAY;

function callAs(user: string): void {
  changeCallStack(user + ' , ' + LAUNCHPAD);
}

function pay(user: string, sent: u64): void {
  mockBalance(LAUNCHPAD, 10_000 * MAS);
  mockBalance(user, 1_000 * MAS);
  callAs(user);
  mockTransferredCoins(sent);
}

function done(): void {
  mockTransferredCoins(0);
}

/** Launchpad (2 % presale fee) + a standard MRC20 owned by ALICE, imported (token id 1). */
function setup(): void {
  resetStorage();
  setDeployContext(ADMIN);
  constructor(new Args().add(new Config(MAS, MAS, MAS, 200, MAS / 10, false)).serialize());
  mockAdminContext(false);
  const token = new Address(TOKEN);
  Storage.setOf(token, STD_OWNER_KEY, stringToBytes(ALICE));
  Storage.setOf(token, stringToBytes('NAME'), stringToBytes('Old Token'));
  Storage.setOf(token, stringToBytes('SYMBOL'), stringToBytes('OLD'));
  Storage.setOf<StaticArray<u8>>(token, stringToBytes('DECIMALS'), [18]);
  Storage.setOf(token, stringToBytes('TOTAL_SUPPLY'), new StaticArray<u8>(32));
  setBytecodeOf(token, [1, 2, 3]);
  pay(ALICE, 10 * MAS);
  importToken(new Args().add(TOKEN).add(u8(0)).add(new ProjectInfo()).serialize());
  done();
  mockTimestamp(NOW);
}

/** Default terms: soft cap 50, hard cap 100, 1-100 MAS per wallet. */
function baseArgs(): Args {
  return new Args()
    .add(TOKEN)
    .add(FOR_SALE)
    .add(RATE)
    .add(50 * MAS)
    .add(100 * MAS)
    .add(MAS)
    .add(u64(0))
    .add(START)
    .add(END);
}

function extrasArgs(
  whitelist: bool,
  publicFrom: u64,
  first: u16 = BPS_ALL,
  cycleMs: u64 = 0,
  cycleBps: u16 = 0,
): StaticArray<u8> {
  return baseArgs()
    .add(whitelist)
    .add(publicFrom)
    .add(first)
    .add(cycleMs)
    .add(cycleBps)
    .serialize();
}

function create(args: StaticArray<u8>): void {
  Storage.setOf(new Address(TOKEN), stringToBytes('BALANCE' + LAUNCHPAD), u256ToBytes(FOR_SALE));
  pay(ALICE, MAS);
  mockScCall([]); // transferFrom
  createPresale(args);
  done();
}

/** 25 % at the end, then 25 % a month: everything after three months. */
function createVesting(): void {
  create(extrasArgs(false, 0, 2_500, MONTH, 2_500));
}

function presale(): Presale {
  return new Args(getPresale(new Args().add(u64(1)).serialize()))
    .nextSerializable<Presale>()
    .unwrap();
}

function idArgs(): StaticArray<u8> {
  return new Args().add(u64(1)).serialize();
}

function listArgs(addresses: string[]): StaticArray<u8> {
  return new Args().add(u64(1)).add(addresses).serialize();
}

function addAs(user: string, addresses: string[]): void {
  pay(user, MAS);
  addToWhitelist(listArgs(addresses));
  done();
}

function removeAs(user: string, addresses: string[]): void {
  pay(user, MAS);
  removeFromWhitelist(listArgs(addresses));
  done();
}

function listed(address: string): bool {
  return isWhitelisted(new Args().add(u64(1)).add(address).serialize())[0] == 1;
}

function contributeAs(user: string, amount: u64): void {
  pay(user, amount + MAS);
  contribute(new Args().add(u64(1)).add(amount).serialize());
  done();
}

function finalizeAt(time: u64): void {
  mockTimestamp(time);
  pay(CAROL, MAS);
  mockScCall([]); // unsold tokens back to the owner
  finalize(idArgs());
  done();
}

function claimAt(user: string, time: u64): void {
  mockTimestamp(time);
  pay(user, MAS);
  mockScCall([]); // token transfer
  claim(idArgs());
  done();
}

function claimed(user: string): u256 {
  return bytesToU256(getClaimed(new Args().add(u64(1)).add(user).serialize()));
}

function contribution(user: string): u64 {
  return bytesToU64(getContribution(new Args().add(u64(1)).add(user).serialize()));
}

function escrowed(): u256 {
  callAs(BOB);
  return bytesToU256(Storage.get(escrowedKey(TOKEN)));
}

function tokens(n: u64): u256 {
  return u256.fromU64(n) * UNIT;
}

/** BOB puts in 40 MAS and CAROL 20 (60 of 100: a success), finalized at the end. */
function runAndFinalize(): void {
  mockTimestamp(START);
  contributeAs(BOB, 40 * MAS);
  contributeAs(CAROL, 20 * MAS);
  finalizeAt(END);
}

describe('Presale extras at creation', () => {
  test('without them, a presale has no whitelist and no vesting', () => {
    setup();
    create(baseArgs().serialize());
    const p = presale();
    expect(p.whitelist).toBe(false);
    expect(p.publicFrom).toBe(0);
    expect(p.vestFirstBps).toBe(BPS_ALL);
    expect(p.vestCycleMs).toBe(0);
    expect(p.vestCycleBps).toBe(0);
  });

  test('the owner chooses a whitelist and a vesting schedule', () => {
    setup();
    create(extrasArgs(true, PUBLIC, 2_500, MONTH, 1_500));
    const p = presale();
    expect(p.whitelist).toBe(true);
    expect(p.publicFrom).toBe(PUBLIC);
    expect(p.whitelisted).toBe(0);
    expect(p.vestFirstBps).toBe(2_500);
    expect(p.vestCycleMs).toBe(MONTH);
    expect(p.vestCycleBps).toBe(1_500);
  });

  test('a page of presales reads in one format', () => {
    setup();
    create(extrasArgs(true, PUBLIC, 2_500, MONTH, 1_500));
    const page = new Args(getPresales(new Args().add(u64(0)).add(u32(10)).serialize()));
    expect(page.nextU64().unwrap()).toBe(1);
    const list = page.nextSerializableObjectArray<Presale>().unwrap();
    expect(list[0].vestCycleBps).toBe(1_500);
  });

  test('a whitelist only presale: public from the end', () => {
    setup();
    create(extrasArgs(true, END));
    expect(presale().publicFrom).toBe(END);
  });

  throws('a public phase from the start', () => {
    setup();
    create(extrasArgs(true, START));
  });

  throws('a public phase after the end', () => {
    setup();
    create(extrasArgs(true, END + 1));
  });

  test('without a whitelist, the public phase is ignored', () => {
    setup();
    create(extrasArgs(false, PUBLIC));
    expect(presale().publicFrom).toBe(0);
  });

  test('without vesting, the cycle terms are ignored', () => {
    setup();
    create(extrasArgs(false, 0, BPS_ALL, 5, 7));
    expect(presale().vestCycleMs).toBe(0);
    expect(presale().vestCycleBps).toBe(0);
  });

  throws('a first release above 100 %', () => {
    setup();
    create(extrasArgs(false, 0, BPS_ALL + 1, MONTH, 1_000));
  });

  throws('vesting with nothing released per cycle', () => {
    setup();
    create(extrasArgs(false, 0, 2_500, MONTH, 0));
  });

  throws('vesting releasing more than 100 % per cycle', () => {
    setup();
    create(extrasArgs(false, 0, 2_500, MONTH, BPS_ALL + 1));
  });

  test('a whole release in one cycle', () => {
    setup();
    create(extrasArgs(false, 0, 0, DAY, BPS_ALL));
    expect(presale().vestCycleBps).toBe(BPS_ALL);
  });

  test('a cycle of one day', () => {
    setup();
    create(extrasArgs(false, 0, 5_000, DAY, 5_000));
    expect(presale().vestCycleMs).toBe(DAY);
  });

  test('vesting from a first release of 99.99 %', () => {
    setup();
    create(extrasArgs(false, 0, 9_999, DAY, 1));
    expect(presale().vestFirstBps).toBe(9_999);
    expect(presale().vestCycleBps).toBe(1);
  });

  throws('a cycle shorter than a day', () => {
    setup();
    create(extrasArgs(false, 0, 5_000, DAY - 1, 5_000));
  });

  test('a schedule of exactly two years', () => {
    setup();
    // 10 cycles of 73 days.
    create(extrasArgs(false, 0, 0, 73 * DAY, 1_000));
    expect(presale().vestCycleMs).toBe(73 * DAY);
  });

  throws('a schedule longer than two years', () => {
    setup();
    create(extrasArgs(false, 0, 0, 73 * DAY + 1, 1_000));
  });

  throws('a last partial cycle counts too (4 cycles of 30 %)', () => {
    setup();
    // 30 + 30 + 30 + 10: four cycles, so 730 / 4 days each at most.
    create(extrasArgs(false, 0, 0, (730 * DAY) / 4 + 1, 3_000));
  });

  test('four cycles of 30 % within two years', () => {
    setup();
    create(extrasArgs(false, 0, 0, (730 * DAY) / 4, 3_000));
    expect(presale().vestCycleBps).toBe(3_000);
  });

  throws('extras sent only in part', () => {
    setup();
    create(baseArgs().add(true).add(PUBLIC).serialize());
  });
});

describe('Presale whitelist', () => {
  test('the owner adds addresses; repeats are skipped', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, [BOB, CAROL]);
    addAs(ALICE, [BOB]);
    expect(presale().whitelisted).toBe(2);
    expect(listed(BOB)).toBe(true);
    expect(listed(CAROL)).toBe(true);
    expect(listed(DAVE)).toBe(false);
  });

  test('a batch of 200 addresses', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    const batch: string[] = [];
    for (let i = 0; i < 200; i++) batch.push('AU1Batch' + (10_000_000 + i).toString() + 'x'.repeat(35));
    addAs(ALICE, batch);
    expect(presale().whitelisted).toBe(200);
  });

  throws('a batch of 201 addresses', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    const batch: string[] = [];
    for (let i = 0; i < 201; i++) batch.push('AU1Batch' + (10_000_000 + i).toString() + 'x'.repeat(35));
    addAs(ALICE, batch);
  });

  throws('an empty batch', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, []);
  });

  throws('an invalid address', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, [BOB, 'not an address']);
  });

  throws('someone else adding', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(BOB, [BOB]);
  });

  throws('adding to a presale without a whitelist', () => {
    setup();
    create(extrasArgs(false, 0));
    addAs(ALICE, [BOB]);
  });

  test('adding until the public phase', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    mockTimestamp(PUBLIC - 1);
    addAs(ALICE, [BOB]);
    expect(listed(BOB)).toBe(true);
  });

  throws('adding once the public phase began', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    mockTimestamp(PUBLIC);
    addAs(ALICE, [BOB]);
  });

  throws('adding to a closed presale', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    pay(ALICE, MAS);
    mockScCall([]); // tokens back
    cancelPresale(idArgs());
    done();
    addAs(ALICE, [BOB]);
  });

  test('the owner removes addresses; unlisted ones are skipped', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, [BOB, CAROL]);
    removeAs(ALICE, [BOB, DAVE]);
    expect(presale().whitelisted).toBe(1);
    expect(listed(BOB)).toBe(false);
    expect(listed(CAROL)).toBe(true);
  });

  test('removing after the presale, to free the storage', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, [BOB, CAROL]);
    pay(ALICE, MAS);
    mockScCall([]);
    cancelPresale(idArgs());
    done();
    removeAs(ALICE, [BOB, CAROL]);
    expect(presale().whitelisted).toBe(0);
  });

  throws('someone else removing', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, [BOB]);
    removeAs(BOB, [BOB]);
  });

  throws('removing a batch of 201', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    const batch: string[] = [];
    for (let i = 0; i < 201; i++) batch.push(BOB);
    removeAs(ALICE, batch);
  });

  test('a listed address contributes before the public phase', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, [BOB]);
    mockTimestamp(START);
    contributeAs(BOB, 10 * MAS);
    expect(contribution(BOB)).toBe(10 * MAS);
  });

  throws('an unlisted address before the public phase', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, [BOB]);
    mockTimestamp(PUBLIC - 1);
    contributeAs(CAROL, 10 * MAS);
  });

  throws('a removed address before the public phase', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    addAs(ALICE, [BOB]);
    removeAs(ALICE, [BOB]);
    mockTimestamp(START);
    contributeAs(BOB, 10 * MAS);
  });

  test('anyone contributes from the public phase', () => {
    setup();
    create(extrasArgs(true, PUBLIC));
    mockTimestamp(PUBLIC);
    contributeAs(CAROL, 10 * MAS);
    expect(contribution(CAROL)).toBe(10 * MAS);
  });

  test('without a whitelist, anyone contributes', () => {
    setup();
    create(extrasArgs(false, 0));
    mockTimestamp(START);
    contributeAs(CAROL, 10 * MAS);
    expect(contribution(CAROL)).toBe(10 * MAS);
  });
});

describe('Presale vesting', () => {
  test('the first release, then a share per cycle, then the rest', () => {
    setup();
    createVesting();
    runAndFinalize();
    const left = escrowed();
    claimAt(BOB, END);
    expect(claimed(BOB)).toBe(tokens(10_000));
    expect(escrowed()).toBe(left - tokens(10_000));
    expect(contribution(BOB)).toBe(40 * MAS);
    claimAt(BOB, END + MONTH);
    expect(claimed(BOB)).toBe(tokens(20_000));
    claimAt(BOB, END + 3 * MONTH);
    expect(escrowed()).toBe(left - tokens(40_000));
    // The last claim frees the storage.
    expect(claimed(BOB)).toBe(u256.Zero);
    expect(contribution(BOB)).toBe(0);
    const ids = new Args(getContributionsOf(new Args().add(BOB).serialize()))
      .nextFixedSizeArray<u64>()
      .unwrap();
    expect(ids.length).toBe(0);
  });

  throws('claiming again before the next unlock', () => {
    setup();
    createVesting();
    runAndFinalize();
    claimAt(BOB, END);
    claimAt(BOB, END + MONTH - 1);
  });

  throws('claiming after everything was claimed', () => {
    setup();
    createVesting();
    runAndFinalize();
    claimAt(BOB, END + 3 * MONTH);
    claimAt(BOB, END + 4 * MONTH);
  });

  test('a late claim takes every unlock at once', () => {
    setup();
    createVesting();
    runAndFinalize();
    const left = escrowed();
    claimAt(BOB, END + 2 * MONTH);
    expect(claimed(BOB)).toBe(tokens(30_000));
    expect(escrowed()).toBe(left - tokens(30_000));
  });

  test('a claim after the last unlock takes everything and keeps no storage', () => {
    setup();
    createVesting();
    runAndFinalize();
    claimAt(CAROL, END + 5 * MONTH);
    expect(claimed(CAROL)).toBe(u256.Zero);
    expect(contribution(CAROL)).toBe(0);
  });

  throws('a share too small for the first release waits for a later unlock', () => {
    setup();
    // 1 token unit per MAS: BOB's 1 MAS buys 1 unit, and 25 % of it rounds down to 0.
    Storage.setOf(new Address(TOKEN), stringToBytes('BALANCE' + LAUNCHPAD), u256ToBytes(FOR_SALE));
    pay(ALICE, MAS);
    mockScCall([]);
    createPresale(
      new Args()
        .add(TOKEN)
        .add(FOR_SALE)
        .add(u256.One)
        .add(50 * MAS)
        .add(100 * MAS)
        .add(MAS)
        .add(u64(0))
        .add(START)
        .add(END)
        .add(false)
        .add(u64(0))
        .add(u16(2_500))
        .add(MONTH)
        .add(u16(2_500))
        .serialize(),
    );
    done();
    mockTimestamp(START);
    contributeAs(BOB, MAS);
    contributeAs(CAROL, 59 * MAS);
    finalizeAt(END);
    claimAt(BOB, END);
  });

  test('cycles count from an early finalize (hard cap reached)', () => {
    setup();
    createVesting();
    mockTimestamp(START);
    contributeAs(BOB, 100 * MAS);
    const at = START + HOUR;
    finalizeAt(at);
    expect(presale().finalizedAt).toBe(at);
    claimAt(BOB, at + MONTH);
    expect(claimed(BOB)).toBe(tokens(50_000));
  });

  test('cycles count from the end when it is finalized late', () => {
    setup();
    createVesting();
    mockTimestamp(START);
    contributeAs(BOB, 40 * MAS);
    contributeAs(CAROL, 20 * MAS);
    finalizeAt(END + 10 * DAY);
    claimAt(BOB, END + MONTH);
    expect(claimed(BOB)).toBe(tokens(20_000));
  });

  test('without vesting, one claim takes everything', () => {
    setup();
    create(extrasArgs(false, 0));
    runAndFinalize();
    const left = escrowed();
    claimAt(BOB, END);
    expect(escrowed()).toBe(left - tokens(40_000));
    expect(contribution(BOB)).toBe(0);
  });

  test('a presale stored before v1.6.0 reads without extras and claims at once', () => {
    setup();
    create(baseArgs().serialize());
    runAndFinalize();
    // Rewrite the record in the old format (no field after feeBps).
    const p = presale();
    const old = new Args()
      .add(p.id)
      .add(p.tokenId)
      .add(p.token)
      .add(p.creator)
      .add(p.tokensForSale)
      .add(p.rate)
      .add(p.softCap)
      .add(p.hardCap)
      .add(p.minBuy)
      .add(p.maxBuy)
      .add(p.start)
      .add(p.end)
      .add(p.raised)
      .add(p.contributors)
      .add(p.status)
      .add(p.withdrawn)
      .add(p.feeBps)
      .serialize();
    callAs(BOB);
    Storage.set(presaleKey(1), old);
    const read = presale();
    expect(read.whitelist).toBe(false);
    expect(read.vestFirstBps).toBe(BPS_ALL);
    expect(read.finalizedAt).toBe(0);
    const left = escrowed();
    claimAt(BOB, END);
    expect(escrowed()).toBe(left - tokens(40_000));
    expect(contribution(BOB)).toBe(0);
  });
});

describe('Vesting math', () => {
  test('a share rounds down and never overflows', () => {
    expect(_share(u256.fromU64(7), 3_333)).toBe(u256.fromU64(2));
    expect(_share(u256.fromU64(10_001), 5_000)).toBe(u256.fromU64(5_000));
    expect(_share(u256.Max, 5_000)).toBe(u256.Max >> 1);
    expect(_share(u256.Max, 10_000)).toBe(u256.Max);
    expect(_share(u256.fromU64(123_456_789), 0)).toBe(u256.Zero);
  });

  test('unlocked share by cycle, capped at 100 %', () => {
    const p = new Presale();
    p.end = 1_000;
    p.finalizedAt = 2_000; // late: count from the end
    p.vestFirstBps = 2_500;
    p.vestCycleMs = 100;
    p.vestCycleBps = 3_000;
    expect(_unlockedBps(p, 500)).toBe(2_500);
    expect(_unlockedBps(p, 1_099)).toBe(2_500);
    expect(_unlockedBps(p, 1_100)).toBe(5_500);
    expect(_unlockedBps(p, 1_200)).toBe(8_500);
    expect(_unlockedBps(p, 1_300)).toBe(10_000);
    expect(_unlockedBps(p, 9_999_999)).toBe(10_000);
    p.finalizedAt = 600; // early: count from the finalize
    expect(_unlockedBps(p, 700)).toBe(5_500);
  });
});
