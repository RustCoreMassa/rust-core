// RustCore Fair Launch — memecoins on a bonding curve that list themselves on Dusa.
//
// Anyone launches a token in one transaction, with no capital: the contract deploys it from the
// RustCore Launchpad's own token template (same verified bytecode), holds the whole supply and
// renounces the token's ownership. Nobody — the creator, the admin, this contract — can mint,
// pause or change it.
//
// The curve (lib/fairlaunch/curve.ts) sells 800 M of the 1 B tokens: the price rises with each
// buy and falls with each sell. When the curve sells out it "graduates": the remaining 200 M
// tokens and the raised MAS (minus a fee and the pool's costs) go into a new Dusa pool at the
// curve's final price, and the pool's liquidity stays in this contract forever — there is no
// function to take it out.
//
// Graduation needs nobody: the buy that sells out the curve books a Massa deferred call to
// `graduate` a few slots later (autonomous smart contract). If that call can't run, anyone may
// call `graduate`, and keeps what the pool didn't use of the reserved costs.
//
// Money rules, as in the Launchpad (lib/launchpad/settlement.ts): every write pays its own
// storage; the MAS in the curves is escrow — the admin can only withdraw the fees collected.
// This contract has no upgrade function: its code can never change.
import { Args, bytesToString, bytesToU32, stringToBytes } from '@massalabs/as-types';
import {
  Address,
  Context,
  Slot,
  Storage,
  balance,
  call,
  createEvent,
  createSC,
  currentPeriod,
  currentThread,
  deferredCallQuote,
  deferredCallRegister,
  generateEvent,
  isDeployingContract,
  transferCoins,
  validateAddress,
} from '@massalabs/massa-as-sdk';
import { u256 } from 'as-bignum/assembly';
import {
  FEES_KEY,
  KIND_TOKEN,
  LOCK_KEY,
  symbolKey,
  templateCodeKey,
  templateHashKey,
  templateVersionKey,
  u64BE,
} from '../lib/launchpad/keys';
import { ProjectInfo } from '../lib/launchpad/records';
import { assertInfo, assertName, assertSymbol, RESERVED_SYMBOLS } from '../lib/launchpad/rules';
import { accruedFees, addFee, settle } from '../lib/launchpad/settlement';
import {
  CURVE_TOKENS,
  POOL_TOKENS,
  TOKEN_DECIMALS,
  TOTAL_SUPPLY,
  binForPrice,
  feeOf,
  quoteBuy,
  quoteSell,
  virtualMasFor,
} from '../lib/fairlaunch/curve';
import {
  FairConfig,
  Launch,
  STATE_COMPLETE,
  STATE_GRADUATED,
  STATE_TRADING,
} from '../lib/fairlaunch/records';

export const VERSION = '1.0.0';

const MAS: u64 = 1_000_000_000;
export const MAX_TRADE_FEE_BPS: u16 = 200; // 2 %
export const MAX_GRADUATION_FEE_BPS: u16 = 500; // 5 %
export const MIN_TARGET_MAS: u64 = 100 * MAS;
/** Keeps the final price under 1 MAS per token (the bin math's range). */
export const MAX_TARGET_MAS: u64 = 100_000_000 * MAS;
export const MAX_DEPLOY_DEPOSIT: u64 = 10 * MAS;
export const MAX_BIN_STEPS: i32 = 8;
export const MAX_AUTO_GAS: u64 = 4_000_000_000;
export const MAX_PAGE: u32 = 50;
/** Sent with each token transfer: the token pays a new holder's balance entry from it. */
export const TOKEN_TRANSFER_DEPOSIT: u64 = 10_000_000; // 0.01 MAS
/** Sent with createLBPair: the new pair's storage; Dusa refunds what it doesn't use. */
export const CREATE_PAIR_COINS: u64 = 12 * MAS;
/** The pool's shape: the raised MAS and the tokens spread over 5 bins on each side of the price. */
export const POOL_HALF_WIDTH: i32 = 5;
/** Storage sent with addLiquidityMAS for 11 bins: Dusa's estimate + 20 % (see app core/dusa). */
export const ADD_LIQUIDITY_STORAGE: u64 = ((140_100_000 + 11 * 45_600_000) * 6) / 5;
/** Kept from the raised MAS for the pool's costs; what they don't use goes to whoever graduates. */
export const GRADUATION_RESERVE: u64 =
  CREATE_PAIR_COINS + ADD_LIQUIDITY_STORAGE + TOKEN_TRANSFER_DEPOSIT;
/** The deferred graduation runs this many periods (16 s each) after the sell-out. */
export const AUTO_GRADUATE_DELAY: u64 = 2;
/** A deferred call costing more than this share of the raised MAS isn't booked. */
const MAX_AUTO_FEE_DIVISOR: u64 = 20; // 5 %
const DISTRIBUTION_ONE: u64 = 1_000_000_000_000_000_000;

const ADMIN_KEY = stringToBytes('admin');
const PENDING_ADMIN_KEY = stringToBytes('padm');
const CONFIG_KEY = stringToBytes('cfg');
const COUNT_KEY = stringToBytes('n');
const LAUNCH = stringToBytes('L:');
const BY_TOKEN = stringToBytes('t:');
const BY_SYMBOL = stringToBytes('s:');
const BY_CREATOR = stringToBytes('o:');
const CLOSE = stringToBytes(':');

function launchKey(id: u64): StaticArray<u8> {
  return LAUNCH.concat(u64BE(id));
}
function tokenKey(token: string): StaticArray<u8> {
  return BY_TOKEN.concat(stringToBytes(token)).concat(CLOSE);
}
function ownSymbolKey(symbol: string): StaticArray<u8> {
  return BY_SYMBOL.concat(stringToBytes(symbol)).concat(CLOSE);
}
function creatorKey(creator: string, id: u64): StaticArray<u8> {
  return BY_CREATOR.concat(stringToBytes(creator)).concat(CLOSE).concat(u64BE(id));
}

// ==================================================== //
// ====                 DEPLOYMENT                 ==== //
// ==================================================== //

/** Args: config (FairConfig). The deployer becomes the admin. */
export function constructor(binaryArgs: StaticArray<u8>): void {
  assert(isDeployingContract(), 'constructor can only run at deploy time');
  const config = new Args(binaryArgs)
    .nextSerializable<FairConfig>()
    .expect('config is missing or invalid');
  _assertConfig(config);
  Storage.set(ADMIN_KEY, stringToBytes(Context.caller().toString()));
  Storage.set(CONFIG_KEY, config.serialize());
  generateEvent('FAIR_LAUNCH_DEPLOYED');
}

// ==================================================== //
// ====                   LAUNCH                   ==== //
// ==================================================== //

/**
 * Deploys a token and opens its curve. Args: name, symbol (A-Z 0-9, free in the Launchpad and
 * here), info (ProjectInfo), devBuy (u64 nanoMAS the creator spends on the curve at once, 0 =
 * none), minTokens (u64, the least the dev buy must get). Coins: creation fee + storage + the
 * token's deposit + devBuy and its trade fee; the rest is refunded.
 */
export function createLaunch(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  const config = _config();
  assert(!config.paused, 'Fair launches are paused');
  _notLocked();
  const args = new Args(binaryArgs);
  const name = args.nextString().expect('name is missing or invalid');
  const symbol = args.nextString().expect('symbol is missing or invalid');
  const info = args.nextSerializable<ProjectInfo>().expect('info is missing or invalid');
  const devBuy = args.nextU64().expect('devBuy is missing or invalid');
  const minTokens = args.nextU64().expect('minTokens is missing or invalid');

  assertName(name);
  assertSymbol(symbol);
  assertInfo(info);
  for (let i = 0; i < RESERVED_SYMBOLS.length; i++) {
    assert(RESERVED_SYMBOLS[i] != symbol, 'This symbol is reserved');
  }
  assert(!Storage.has(ownSymbolKey(symbol)), 'This symbol is already taken');
  const launchpad = new Address(config.launchpad);
  assert(!Storage.hasOf(launchpad, symbolKey(symbol)), 'This symbol is taken in the Launchpad');

  // The Launchpad's newest token template: the same bytecode, version and hash it launches.
  const versionKey = templateVersionKey(KIND_TOKEN);
  assert(Storage.hasOf(launchpad, versionKey), 'The Launchpad has no token template');
  const version = bytesToU32(Storage.getOf(launchpad, versionKey));
  const self = Context.callee();
  const token = createSC(Storage.getOf(launchpad, templateCodeKey(KIND_TOKEN, version)));
  call(
    token,
    'constructor',
    new Args()
      .add(name)
      .add(symbol)
      .add(TOKEN_DECIMALS)
      .add(u256.fromU64(TOTAL_SUPPLY))
      .add(self.toString())
      .add(false) // mintable
      .add(u256.Zero)
      .add(false) // burnable
      .add(false), // mutable
    config.deployDeposit,
  );
  call(token, 'renounceOwnership', new Args(), 0);

  const creator = Context.caller().toString();
  const id = _count() + 1;
  Storage.set(COUNT_KEY, u64BE(id));
  const launch = new Launch(
    id,
    token.toString(),
    creator,
    Context.timestamp(),
    name,
    symbol,
    version,
    Storage.getOf(launchpad, templateHashKey(KIND_TOKEN, version)),
    virtualMasFor(config.targetMas),
    config.targetMas,
    config.tradeFeeBps,
    config.graduationFeeBps,
  );
  launch.info = info;
  Storage.set(tokenKey(launch.token), u64BE(id));
  Storage.set(ownSymbolKey(symbol), u64BE(id));
  Storage.set(creatorKey(creator, id), new StaticArray<u8>(0));
  generateEvent(createEvent('LAUNCH_CREATED', [id.toString(), launch.token, creator]));

  let fee = config.creationFee;
  let kept: u64 = 0;
  let released: u64 = 0;
  if (devBuy > 0) {
    const trade = _buy(launch, config, creator, devBuy, minTokens);
    fee += trade.fee;
    kept = trade.mas;
    released = trade.autoFee;
  } else {
    _save(launch);
  }
  settle(before, fee, kept, released);
}

// ==================================================== //
// ====                   TRADING                  ==== //
// ==================================================== //

/**
 * Buys on the curve. Args: id (u64), mas (u64 nanoMAS to spend, fee on top), minTokens (u64,
 * the least accepted: the price may move before the buy runs). Buying the last tokens spends
 * only what they cost. Coins: mas + its fee + 0.01 MAS for the token transfer; rest refunded.
 */
export function buy(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  const config = _config();
  assert(!config.paused, 'Fair launches are paused');
  _notLocked();
  const args = new Args(binaryArgs);
  const launch = _load(args.nextU64().expect('id is missing or invalid'));
  const mas = args.nextU64().expect('mas is missing or invalid');
  const minTokens = args.nextU64().expect('minTokens is missing or invalid');
  const trade = _buy(launch, config, Context.caller().toString(), mas, minTokens);
  settle(before, trade.fee, trade.mas, trade.autoFee);
}

/**
 * Sells back to the curve. The seller first calls increaseAllowance(this contract, tokens) on
 * the token. Args: id (u64), tokens (u64 smallest units), minMas (u64, the least accepted after
 * the fee). Coins: 0.01 MAS for the token transfer; the rest is refunded.
 */
export function sell(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const args = new Args(binaryArgs);
  const launch = _load(args.nextU64().expect('id is missing or invalid'));
  const tokens = args.nextU64().expect('tokens is missing or invalid');
  const minMas = args.nextU64().expect('minMas is missing or invalid');
  assert(launch.state == STATE_TRADING, 'The curve has sold out: trade on Dusa');
  assert(tokens > 0, 'Sell more than zero tokens');
  assert(tokens <= launch.sold, 'More than the curve has sold');

  const gross = quoteSell(launch.virtualMas, launch.masIn, launch.sold, tokens);
  const fee = feeOf(gross, launch.tradeFeeBps);
  const net = gross - fee;
  assert(net > 0, 'Too few tokens to sell');
  assert(net >= minMas, 'The price moved: you would get less than your minimum');
  launch.sold -= tokens;
  launch.masIn -= gross;
  _save(launch);

  const seller = Context.caller().toString();
  call(
    new Address(launch.token),
    'transferFrom',
    new Args().add(seller).add(Context.callee().toString()).add(u256.fromU64(tokens)),
    TOKEN_TRANSFER_DEPOSIT,
  );
  transferCoins(new Address(seller), net);
  addFee(fee);
  _tradeEvent(launch, seller, false, gross, tokens);
  settle(before, 0, 0, net);
}

class Trade {
  constructor(
    public mas: u64,
    public fee: u64,
    public autoFee: u64,
  ) {}
}

function _buy(launch: Launch, config: FairConfig, buyer: string, mas: u64, minTokens: u64): Trade {
  assert(launch.state == STATE_TRADING, 'The curve has sold out: trade on Dusa');
  assert(mas > 0, 'Buy for more than zero MAS');
  const quote = quoteBuy(launch.virtualMas, launch.masIn, launch.sold, mas);
  assert(quote.tokens > 0, 'Too little MAS to buy a token unit');
  assert(quote.tokens >= minTokens, 'The price moved: you would get less than your minimum');
  const fee = feeOf(quote.mas, launch.tradeFeeBps);
  launch.sold += quote.tokens;
  launch.masIn += quote.mas;
  let autoFee: u64 = 0;
  if (launch.sold == CURVE_TOKENS) {
    launch.state = STATE_COMPLETE;
    autoFee = _scheduleGraduation(launch, config);
    launch.autoFee = autoFee;
    generateEvent(createEvent('LAUNCH_COMPLETED', [launch.id.toString()]));
  }
  _save(launch);
  call(
    new Address(launch.token),
    'transfer',
    new Args().add(buyer).add(u256.fromU64(quote.tokens)),
    TOKEN_TRANSFER_DEPOSIT,
  );
  _tradeEvent(launch, buyer, true, quote.mas, quote.tokens);
  return new Trade(quote.mas, fee, autoFee);
}

/** Books the deferred call that graduates the launch; returns its price (0 when not booked). */
function _scheduleGraduation(launch: Launch, config: FairConfig): u64 {
  if (config.autoGraduateGas == 0) return 0;
  const slot = new Slot(currentPeriod() + AUTO_GRADUATE_DELAY, currentThread());
  const params = new Args().add(launch.id).serialize();
  const price = deferredCallQuote(slot, config.autoGraduateGas, params.length);
  if (price > launch.masIn / MAX_AUTO_FEE_DIVISOR) return 0;
  const callId = deferredCallRegister(
    Context.callee().toString(),
    'graduate',
    slot,
    config.autoGraduateGas,
    params,
    0,
  );
  generateEvent(createEvent('GRADUATION_SCHEDULED', [launch.id.toString(), callId]));
  return price;
}

function _tradeEvent(launch: Launch, who: string, isBuy: bool, mas: u64, tokens: u64): void {
  generateEvent(
    createEvent(isBuy ? 'BUY' : 'SELL', [
      launch.id.toString(),
      who,
      mas.toString(),
      tokens.toString(),
      launch.sold.toString(),
      launch.masIn.toString(),
    ]),
  );
}

// ==================================================== //
// ====                 GRADUATION                 ==== //
// ==================================================== //

/**
 * Moves a sold-out launch to Dusa. Args: id (u64). Anyone may call it (the deferred call does);
 * the caller keeps what the pool's reserved costs didn't use. The pool gets POOL_TOKENS and the
 * raised MAS minus the graduation fee, the deferred call's price and GRADUATION_RESERVE, at the
 * bin of that price, in the first bin step of the config whose pool is free (or already at that
 * price). Its liquidity is held by this contract, which can never remove it.
 */
export function graduate(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const config = _config();
  const launch = _load(new Args(binaryArgs).nextU64().expect('id is missing or invalid'));
  assert(launch.state == STATE_COMPLETE, 'This launch is not ready to graduate');

  const graduationFee = feeOf(launch.masIn, launch.graduationFeeBps);
  const budget = launch.masIn - graduationFee - launch.autoFee;
  assert(budget > GRADUATION_RESERVE, 'Too little MAS for a pool');
  const poolMas = budget - GRADUATION_RESERVE;

  // Pick the bin step: no pool yet, or a pool already at the right price.
  let binStep: u32 = 0;
  let pair = '';
  let activeId: u32 = 0;
  for (let i = 0; i < config.binSteps.length; i++) {
    const step = config.binSteps[i];
    const id = binForPrice(poolMas, POOL_TOKENS, step);
    const existing = _findPair(config, launch.token, step);
    if (existing.length == 0) {
      binStep = step;
      activeId = id;
      break;
    }
    const current = _activeId(existing);
    if (current + 1 >= id && current <= id + 1) {
      binStep = step;
      pair = existing;
      activeId = current;
      break;
    }
  }
  assert(binStep > 0, 'Every Dusa pool for this token is at another price');

  const token = new Address(launch.token);
  const router = new Address(config.dusaRouter);
  Storage.set(LOCK_KEY, new StaticArray<u8>(0));
  call(
    token,
    'increaseAllowance',
    new Args().add(config.dusaRouter).add(u256.fromU64(POOL_TOKENS)),
    TOKEN_TRANSFER_DEPOSIT,
  );
  if (pair.length == 0) {
    call(
      router,
      'createLBPair',
      new Args().add(launch.token).add(config.wmas).add(activeId).add(binStep),
      CREATE_PAIR_COINS,
    );
    pair = _findPair(config, launch.token, binStep);
    assert(pair.length > 0, 'Dusa did not create the pool');
  }
  call(
    router,
    'addLiquidityMAS',
    _addLiquidityArgs(launch, config, binStep, activeId, poolMas),
    ADD_LIQUIDITY_STORAGE + poolMas,
  );
  Storage.del(LOCK_KEY);

  launch.state = STATE_GRADUATED;
  launch.pair = pair;
  launch.binStep = binStep;
  launch.graduatedAt = Context.timestamp();
  launch.masIn = 0;
  _save(launch);
  addFee(graduationFee);
  generateEvent(createEvent('LAUNCH_GRADUATED', [launch.id.toString(), pair, binStep.toString()]));
  // `budget` leaves the escrow: the pool and its costs; what they didn't use is refunded.
  settle(before, 0, 0, budget);
}

/** Dusa's addLiquidityMAS arguments (same layout as the app's core/dusa addLiquidityCall). */
function _addLiquidityArgs(
  launch: Launch,
  config: FairConfig,
  binStep: u32,
  activeId: u32,
  poolMas: u64,
): Args {
  const n = POOL_HALF_WIDTH;
  const bins = 2 * n + 1;
  const deltaIds = new Array<i64>(bins);
  const distX = new Array<u256>(bins);
  const distY = new Array<u256>(bins);
  // Dusa's "spot" shape, as the app's uniformDistribution: tokens in the active bin and above,
  // MAS in the active bin and below, the active bin with half a share of each.
  const share = DISTRIBUTION_ONE / u64(bins);
  let sumX: u64 = 0;
  let sumY: u64 = 0;
  for (let i = 0; i < bins; i++) {
    const delta = i - n;
    deltaIds[i] = i64(delta);
    const side = delta == 0 ? share : 2 * share;
    const x: u64 = delta < 0 ? 0 : side;
    const y: u64 = delta > 0 ? 0 : side;
    sumX += x;
    sumY += y;
    distX[i] = u256.fromU64(x);
    distY[i] = u256.fromU64(y);
  }
  distX[bins - 1] = u256.fromU64(distX[bins - 1].toU64() + DISTRIBUTION_ONE - sumX);
  distY[0] = u256.fromU64(distY[0].toU64() + DISTRIBUTION_ONE - sumY);

  // Our own new pool: 1 % slippage on the amounts is only rounding room.
  const minX = POOL_TOKENS - POOL_TOKENS / 100;
  const minY = poolMas - poolMas / 100;
  return new Args()
    .add(launch.token)
    .add(config.wmas)
    .add(u64(binStep))
    .add(u256.fromU64(POOL_TOKENS))
    .add(u256.fromU64(poolMas))
    .add(u256.fromU64(minX))
    .add(u256.fromU64(minY))
    .add(u64(activeId))
    .add(u64(1)) // idSlippage
    .add(deltaIds)
    .add(distX)
    .add(distY)
    .add(Context.callee().toString()) // the liquidity stays here, for good
    .add(Context.timestamp() + 60 * 60 * 1000)
    .add(ADD_LIQUIDITY_STORAGE);
}

/** The token/WMAS pair at `binStep` on Dusa's factory, or ''. */
function _findPair(config: FairConfig, token: string, binStep: u32): string {
  const bytes = call(
    new Address(config.dusaFactory),
    'getAllLBPairs',
    new Args().add(token).add(config.wmas),
    0,
  );
  const args = new Args(bytes);
  while (args.offset < bytes.length) {
    const step = args.nextU32().expect('Unreadable Dusa pair list');
    const pair = args.nextString().expect('Unreadable Dusa pair list');
    args.nextBool().expect('Unreadable Dusa pair list'); // createdByOwner
    args.nextBool().expect('Unreadable Dusa pair list'); // blacklisted
    if (step == binStep) return pair;
  }
  return '';
}

/** A Dusa pair's active bin (getPairInformation: activeId u32, reserves…). */
function _activeId(pair: string): u32 {
  const bytes = call(new Address(pair), 'getPairInformation', new Args(), 0);
  return new Args(bytes).nextU32().expect('Unreadable Dusa pair');
}

// ==================================================== //
// ====                    ADMIN                   ==== //
// ==================================================== //

/** Args: config (FairConfig). Launches already created keep their fees and target. */
export function setConfig(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _onlyAdmin();
  const config = new Args(binaryArgs)
    .nextSerializable<FairConfig>()
    .expect('config is missing or invalid');
  _assertConfig(config);
  Storage.set(CONFIG_KEY, config.serialize());
  generateEvent('CONFIG_UPDATED');
  settle(before, 0);
}

/** Args: id (u64), hidden (bool). Hidden launches keep trading; the app leaves them out. */
export function setHidden(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _onlyAdmin();
  const args = new Args(binaryArgs);
  const launch = _load(args.nextU64().expect('id is missing or invalid'));
  launch.hidden = args.nextBool().expect('hidden is missing or invalid');
  _save(launch);
  settle(before, 0);
}

/** Sends the fees collected to the admin. The curves' MAS can't be withdrawn. */
export function withdrawFees(_: StaticArray<u8>): void {
  const before = balance();
  _onlyAdmin();
  _notLocked();
  const amount = accruedFees();
  assert(amount > 0, 'No fees to withdraw');
  Storage.set(FEES_KEY, new StaticArray<u8>(8));
  transferCoins(Context.caller(), amount);
  generateEvent(createEvent('FEES_WITHDRAWN', [amount.toString()]));
  settle(before, 0, 0, amount);
}

/** Args: newAdmin (string). It becomes admin when it calls acceptAdmin. */
export function transferAdmin(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _onlyAdmin();
  const next = new Args(binaryArgs).nextString().expect('newAdmin is missing or invalid');
  assert(validateAddress(next), 'Invalid address');
  Storage.set(PENDING_ADMIN_KEY, stringToBytes(next));
  settle(before, 0);
}

export function acceptAdmin(_: StaticArray<u8>): void {
  const before = balance();
  assert(Storage.has(PENDING_ADMIN_KEY), 'No admin transfer pending');
  const caller = Context.caller().toString();
  assert(
    caller == bytesToString(Storage.get(PENDING_ADMIN_KEY)),
    'Only the pending admin can accept',
  );
  Storage.set(ADMIN_KEY, stringToBytes(caller));
  Storage.del(PENDING_ADMIN_KEY);
  generateEvent(createEvent('ADMIN_CHANGED', [caller]));
  settle(before, 0);
}

// ==================================================== //
// ====                    READS                   ==== //
// ==================================================== //

export function version(_: StaticArray<u8>): StaticArray<u8> {
  return stringToBytes(VERSION);
}

export function admin(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(ADMIN_KEY);
}

export function config(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(CONFIG_KEY);
}

/** Fees collected and not withdrawn (u64). */
export function fees(_: StaticArray<u8>): StaticArray<u8> {
  return new Args().add(accruedFees()).serialize();
}

/** Launches created so far (u64); ids run 1..count. */
export function count(_: StaticArray<u8>): StaticArray<u8> {
  return new Args().add(_count()).serialize();
}

/** Args: id (u64). Returns the Launch record. */
export function getLaunch(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  return _load(new Args(binaryArgs).nextU64().expect('id is missing or invalid')).serialize();
}

/** Args: token (string). Returns its launch id (u64), 0 if it isn't a fair launch. */
export function launchOfToken(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const key = tokenKey(new Args(binaryArgs).nextString().expect('token is missing or invalid'));
  return new Args().add(Storage.has(key) ? _u64(Storage.get(key)) : u64(0)).serialize();
}

/**
 * Newest first. Args: before (u64, exclusive; 0 = from the newest), limit (u32, ≤ 50).
 * Returns Launch[] (hidden ones included, flagged).
 */
export function getLaunches(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  let from = args.nextU64().expect('before is missing or invalid');
  let limit = args.nextU32().expect('limit is missing or invalid');
  if (limit > MAX_PAGE) limit = MAX_PAGE;
  const total = _count();
  let id = from == 0 || from > total + 1 ? total : from - 1;
  const out: Launch[] = [];
  while (id > 0 && u32(out.length) < limit) {
    out.push(_load(id));
    id--;
  }
  return new Args().addSerializableObjectArray(out).serialize();
}

/** Args: creator (string). Returns the ids of their launches (u64[]), oldest first. */
export function getLaunchesBy(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const creator = new Args(binaryArgs).nextString().expect('creator is missing or invalid');
  const prefix = BY_CREATOR.concat(stringToBytes(creator)).concat(CLOSE);
  const keys = Storage.getKeys(prefix);
  const ids: u64[] = [];
  for (let i = 0; i < keys.length; i++) ids.push(_u64At(keys[i], prefix.length));
  return new Args().add(ids).serialize();
}

/**
 * What a buy would get now. Args: id (u64), mas (u64). Returns tokens (u64), mas the curve takes
 * (u64, less than asked when it sells out), fee (u64, on top).
 */
export function quoteBuyOf(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const launch = _load(args.nextU64().expect('id is missing or invalid'));
  const mas = args.nextU64().expect('mas is missing or invalid');
  if (launch.state != STATE_TRADING)
    return new Args().add(u64(0)).add(u64(0)).add(u64(0)).serialize();
  const quote = quoteBuy(launch.virtualMas, launch.masIn, launch.sold, mas);
  return new Args()
    .add(quote.tokens)
    .add(quote.mas)
    .add(feeOf(quote.mas, launch.tradeFeeBps))
    .serialize();
}

/** What a sell would pay now. Args: id (u64), tokens (u64). Returns mas after fee, fee (u64). */
export function quoteSellOf(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const launch = _load(args.nextU64().expect('id is missing or invalid'));
  const tokens = args.nextU64().expect('tokens is missing or invalid');
  if (launch.state != STATE_TRADING || tokens > launch.sold)
    return new Args().add(u64(0)).add(u64(0)).serialize();
  const gross = quoteSell(launch.virtualMas, launch.masIn, launch.sold, tokens);
  const fee = feeOf(gross, launch.tradeFeeBps);
  return new Args()
    .add(gross - fee)
    .add(fee)
    .serialize();
}

// ==================================================== //
// ====                  INTERNAL                  ==== //
// ==================================================== //

function _config(): FairConfig {
  return new Args(Storage.get(CONFIG_KEY))
    .nextSerializable<FairConfig>()
    .expect('config is unreadable');
}

function _assertConfig(config: FairConfig): void {
  assert(config.tradeFeeBps <= MAX_TRADE_FEE_BPS, 'Trade fee above 2%');
  assert(config.graduationFeeBps <= MAX_GRADUATION_FEE_BPS, 'Graduation fee above 5%');
  assert(
    config.targetMas >= MIN_TARGET_MAS && config.targetMas <= MAX_TARGET_MAS,
    'Target must be 100 to 100 000 000 MAS',
  );
  assert(config.deployDeposit <= MAX_DEPLOY_DEPOSIT, 'Deploy deposit above 10 MAS');
  assert(validateAddress(config.launchpad), 'Invalid Launchpad address');
  assert(validateAddress(config.dusaRouter), 'Invalid Dusa router address');
  assert(validateAddress(config.dusaFactory), 'Invalid Dusa factory address');
  assert(validateAddress(config.wmas), 'Invalid WMAS address');
  assert(
    config.binSteps.length > 0 && config.binSteps.length <= MAX_BIN_STEPS,
    'Give 1 to 8 bin steps',
  );
  for (let i = 0; i < config.binSteps.length; i++) {
    assert(config.binSteps[i] > 0 && config.binSteps[i] <= 1_000, 'Invalid bin step');
  }
  assert(config.autoGraduateGas <= MAX_AUTO_GAS, 'Auto-graduation gas too high');
}

function _onlyAdmin(): void {
  assert(
    Context.caller().toString() == bytesToString(Storage.get(ADMIN_KEY)),
    'Only the admin can do this',
  );
}

function _notLocked(): void {
  assert(!Storage.has(LOCK_KEY), 'Fair Launch is busy, try again');
}

function _count(): u64 {
  return Storage.has(COUNT_KEY) ? _u64(Storage.get(COUNT_KEY)) : 0;
}

function _load(id: u64): Launch {
  const key = launchKey(id);
  assert(Storage.has(key), 'No such launch');
  return new Args(Storage.get(key)).nextSerializable<Launch>().expect('launch is unreadable');
}

function _save(launch: Launch): void {
  Storage.set(launchKey(launch.id), launch.serialize());
}

function _u64(bytes: StaticArray<u8>): u64 {
  return _u64At(bytes, 0);
}

function _u64At(bytes: StaticArray<u8>, offset: i32): u64 {
  let value: u64 = 0;
  for (let i = 0; i < 8; i++) value = (value << 8) | u64(bytes[offset + i]);
  return value;
}
