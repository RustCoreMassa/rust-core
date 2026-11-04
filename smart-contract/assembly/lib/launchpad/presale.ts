// Token presales. The owner escrows the tokens for sale in the Launchpad; contributors send MAS.
// At the end, success (raised ≥ soft cap): contributors claim their tokens, the owner withdraws
// the MAS minus the presale fee and takes the unsold tokens back. Failure or cancel: contributors
// take their MAS back, the owner all the tokens.
// Pull, never push: no call loops over contributors, and closing a presale (finalize, cancel)
// moves no token since v1.8.0 — the owner takes them back with `reclaimTokens`, so a token whose
// transfers fail can block only its own transfers, never refunds.
//
// Optional extras (v1.6.0), chosen by the owner at creation: a whitelist (only listed addresses
// contribute until `publicFrom`, then anyone) and vesting (a first share of the bought tokens at
// once, then a fixed share at the end of every cycle). Presales created before keep neither.
//
// Token moves call the token's code (it may be an imported contract), so they run under the
// same lock as the marketplace, after this contract's state is final. The escrow is checked:
// after taking the tokens in, the Launchpad must hold at least everything it owes for that token.
import {
  Args,
  boolToByte,
  bytesToU256,
  bytesToU64,
  u256ToBytes,
  u64ToBytes,
} from '@massalabs/as-types';
import {
  Address,
  Context,
  Storage,
  balance,
  call,
  createEvent,
  generateEvent,
  transferCoins,
  validateAddress,
} from '@massalabs/massa-as-sdk';
import { u256 } from 'as-bignum/assembly';
import { _activeConfig, _count, _isAdmin, _nextId, _ownerOf, _projectByAddress } from './common';
import {
  COUNTER_PRESALE,
  KIND_TOKEN,
  LOCK_KEY,
  bytes,
  contributionKey,
  contributionsOfKey,
  contributionsOfPrefix,
  escrowedKey,
  mrc20BalanceKey,
  presaleActiveKey,
  presaleKey,
  reclaimKey,
  u64FromBE,
  vestClaimedKey,
  whitelistKey,
} from './keys';
import {
  BPS_ALL,
  PRESALE_CANCELLED,
  PRESALE_FAILED,
  PRESALE_OPEN,
  PRESALE_SUCCESS,
  Presale,
} from './records';
import { _feeBpsFor } from './discount';
import { divU256ByU64 } from './math';
import { MAX_PAGE } from './rules';
import { addFee, settle } from './settlement';

const HOUR: u64 = 60 * 60 * 1000;
const DAY: u64 = 24 * HOUR;
export const MIN_DURATION_MS: u64 = HOUR;
export const MAX_DURATION_MS: u64 = 30 * DAY;
/** A presale may be scheduled up to 90 days ahead. */
export const MAX_START_DELAY_MS: u64 = 90 * DAY;
const NANO_PER_MAS: u64 = 1_000_000_000;
/** Addresses added to or removed from a whitelist in one call. */
export const MAX_WHITELIST_BATCH: i32 = 200;
/** Vesting: a cycle lasts at least a day, and the whole schedule at most two years. */
export const MIN_VEST_CYCLE_MS: u64 = DAY;
export const MAX_VESTING_MS: u64 = 730 * DAY;
/**
 * Sent with each token transfer: the token pays the receiver's new balance entry from its own
 * balance (≈ 0.0096 MAS for a new holder). Unused coins stay in the token as its reserve.
 */
export const TOKEN_TRANSFER_DEPOSIT: u64 = 10_000_000; // 0.01 MAS

// ==================================================== //
// ====                   WRITES                   ==== //
// ==================================================== //

/**
 * Starts a presale of a Launchpad token the caller owns. The caller first calls
 * increaseAllowance(Launchpad, tokensForSale) on the token. Args: token (string),
 * tokensForSale (u256), rate (u256, token units per 1 MAS), softCap, hardCap, minBuy, maxBuy
 * (u64 nanoMAS; maxBuy 0 = no limit), start (u64 ms; a past start = now), end (u64 ms).
 * Optional (v1.6.0), all or none: whitelist (bool), publicFrom (u64 ms, start < publicFrom ≤
 * end; ignored without a whitelist), vestFirstBps (u16, 10 000 = no vesting), vestCycleMs (u64),
 * vestCycleBps (u16) — the last two ignored without vesting. Coins: storage + 0.01 MAS.
 */
export function createPresale(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  const config = _activeConfig();
  _notLocked();
  const args = new Args(binaryArgs);
  const token = args.nextString().expect('token is missing or invalid');
  const tokensForSale = args.nextU256().expect('tokensForSale is missing or invalid');
  const rate = args.nextU256().expect('rate is missing or invalid');
  const softCap = args.nextU64().expect('softCap is missing or invalid');
  const hardCap = args.nextU64().expect('hardCap is missing or invalid');
  const minBuy = args.nextU64().expect('minBuy is missing or invalid');
  const maxBuy = args.nextU64().expect('maxBuy is missing or invalid');
  let start = args.nextU64().expect('start is missing or invalid');
  const end = args.nextU64().expect('end is missing or invalid');
  let whitelist = false;
  let publicFrom: u64 = 0;
  let vestFirstBps = BPS_ALL;
  let vestCycleMs: u64 = 0;
  let vestCycleBps: u16 = 0;
  const extras = args.nextBool();
  if (extras.isOk()) {
    whitelist = extras.unwrap();
    publicFrom = args.nextU64().expect('publicFrom is missing or invalid');
    vestFirstBps = args.nextU16().expect('vestFirstBps is missing or invalid');
    vestCycleMs = args.nextU64().expect('vestCycleMs is missing or invalid');
    vestCycleBps = args.nextU16().expect('vestCycleBps is missing or invalid');
  }

  const project = _projectByAddress(token);
  assert(project != null && project.kind == KIND_TOKEN, 'Not a Launchpad token');
  assert(!project!.hidden, 'This token is hidden');
  const creator = Context.caller().toString();
  assert(_ownerOf(new Address(token)) == creator, 'Only the token owner can start a presale');
  assert(!Storage.has(presaleActiveKey(token)), 'This token already has an open presale');

  const now = Context.timestamp();
  // A start already past (0, "now", or time spent waiting for the transaction) means: start now.
  if (start < now) start = now;
  assert(start - now <= MAX_START_DELAY_MS, 'Start within the next 90 days');
  assert(end > start, 'The end must be after the start');
  assert(end - start >= MIN_DURATION_MS && end - start <= MAX_DURATION_MS, 'Run 1 hour to 30 days');
  assert(hardCap > 0, 'The hard cap must be greater than zero');
  assert(softCap <= hardCap, 'The soft cap must not exceed the hard cap');
  assert(maxBuy == 0 || minBuy <= maxBuy, 'The minimum must not exceed the maximum');
  assert(minBuy <= hardCap, 'The minimum must not exceed the hard cap');
  assert(rate > u256.Zero, 'The rate must be greater than zero');
  // hardCap × rate must fit in a u256: as-bignum's multiplication wraps around silently.
  assert(rate <= divU256ByU64(u256.Max, hardCap), 'The rate is too high');
  assert(tokensForSale > u256.Zero, 'Put some tokens up for sale');
  assert(_tokensFor(hardCap, rate) <= tokensForSale, 'Not enough tokens for the hard cap');
  if (whitelist) {
    assert(
      publicFrom > start && publicFrom <= end,
      'The public phase must begin after the start, by the end',
    );
  } else publicFrom = 0;
  assert(vestFirstBps <= BPS_ALL, 'The first release must be at most 100%');
  if (vestFirstBps < BPS_ALL) {
    assert(vestCycleBps > 0 && vestCycleBps <= BPS_ALL, 'Release 0.01-100% per cycle');
    assert(vestCycleMs >= MIN_VEST_CYCLE_MS, 'A vesting cycle lasts at least a day');
    const cycles = u64((BPS_ALL - vestFirstBps + vestCycleBps - 1) / vestCycleBps);
    assert(vestCycleMs <= MAX_VESTING_MS / cycles, 'Vesting must end within two years');
  } else {
    vestCycleMs = 0;
    vestCycleBps = 0;
  }

  const id = _nextId(COUNTER_PRESALE);
  const presale = new Presale(
    id,
    project!.id,
    token,
    creator,
    tokensForSale,
    rate,
    softCap,
    hardCap,
    minBuy,
    maxBuy,
    start,
    end,
  );
  presale.feeBps = _feeBpsFor(config.presaleFeeBps, creator);
  presale.whitelist = whitelist;
  presale.publicFrom = publicFrom;
  presale.vestFirstBps = vestFirstBps;
  presale.vestCycleMs = vestCycleMs;
  presale.vestCycleBps = vestCycleBps;
  Storage.set(presaleKey(id), presale.serialize());
  Storage.set(presaleActiveKey(token), u64ToBytes(id));
  const owed = _escrowed(token) + tokensForSale;
  Storage.set(escrowedKey(token), u256ToBytes(owed));

  // Then the tokens come in, and must really have come in.
  _lock();
  const launchpad = Context.callee().toString();
  call(
    new Address(token),
    'transferFrom',
    new Args().add(creator).add(launchpad).add(tokensForSale),
    TOKEN_TRANSFER_DEPOSIT,
  );
  assert(_balanceIn(token, launchpad) >= owed, 'The tokens did not reach the escrow');
  _unlock();
  generateEvent(createEvent('PRESALE_CREATED', [id.toString(), token, creator]));
  settle(before, 0);
}

/**
 * Args: presaleId (u64), amount (u64, nanoMAS). Coins: amount + storage (≈ 0.02 MAS the first
 * time); the rest is refunded.
 */
export function contribute(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _activeConfig();
  _notLocked();
  const args = new Args(binaryArgs);
  const presale = _load(args.nextU64().expect('presaleId is missing or invalid'));
  const amount = args.nextU64().expect('amount is missing or invalid');
  const contributor = Context.caller().toString();
  const now = Context.timestamp();
  assert(presale.status == PRESALE_OPEN, 'This presale is closed');
  assert(now >= presale.start, 'This presale has not started yet');
  assert(now < presale.end, 'This presale has ended');
  assert(
    !presale.whitelist ||
      now >= presale.publicFrom ||
      Storage.has(whitelistKey(presale.id, contributor)),
    'Only the whitelist can contribute for now',
  );
  assert(amount > 0, 'Enter an amount');
  assert(presale.raised < presale.hardCap, 'The hard cap is reached');
  assert(amount <= presale.hardCap - presale.raised, 'Above the amount left before the hard cap');

  const key = contributionKey(presale.id, contributor);
  const previous = Storage.has(key) ? bytesToU64(Storage.get(key)) : 0;
  const total = previous + amount;
  // The last buyer may take what is left even if it is below the minimum.
  const left = presale.hardCap - presale.raised;
  assert(total >= presale.minBuy || amount == left, 'Below the minimum contribution');
  assert(presale.maxBuy == 0 || total <= presale.maxBuy, 'Above the maximum per wallet');

  Storage.set(key, u64ToBytes(total));
  if (previous == 0) {
    Storage.set(contributionsOfKey(contributor, presale.id), new StaticArray<u8>(0));
    presale.contributors += 1;
  }
  presale.raised += amount;
  Storage.set(presaleKey(presale.id), presale.serialize());
  generateEvent(
    createEvent('CONTRIBUTED', [presale.id.toString(), contributor, amount.toString()]),
  );
  settle(before, 0, amount);
}

/**
 * Closes a presale once it ended (or reached its hard cap). Anyone can call it. Success when
 * the soft cap is reached: the unsold tokens wait for the owner (`reclaimTokens`). Failure: all
 * of them. Args: presaleId (u64). Coins: ≈ 0.01 MAS.
 */
export function finalize(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const presale = _load(new Args(binaryArgs).nextU64().expect('presaleId is missing or invalid'));
  assert(presale.status == PRESALE_OPEN, 'This presale is already closed');
  assert(
    Context.timestamp() >= presale.end || presale.raised == presale.hardCap,
    'This presale is still running',
  );
  const success = presale.raised > 0 && presale.raised >= presale.softCap;
  presale.finalizedAt = Context.timestamp();
  presale.status = success ? PRESALE_SUCCESS : PRESALE_FAILED;
  const back = success
    ? presale.tokensForSale - _tokensFor(presale.raised, presale.rate)
    : presale.tokensForSale;
  _close(presale, back);
  generateEvent(createEvent('FINALIZED', [presale.id.toString(), success ? 'success' : 'failed']));
  settle(before, 0);
}

/**
 * Contributor's tokens after a success: all of them, or with vesting what is unlocked and not
 * claimed yet (call again after each unlock; the last claim frees the storage). Args: presaleId
 * (u64). Coins: ≈ 0.01 MAS, ≈ 0.02 MAS for a first partial claim (storage, refunded at the last).
 */
export function claim(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const presale = _load(new Args(binaryArgs).nextU64().expect('presaleId is missing or invalid'));
  assert(
    presale.status == PRESALE_SUCCESS,
    'Tokens can be claimed only after a successful presale',
  );
  const contributor = Context.caller().toString();
  const key = contributionKey(presale.id, contributor);
  assert(Storage.has(key), 'Nothing to take in this presale');
  const all = _tokensFor(bytesToU64(Storage.get(key)), presale.rate);
  const unlocked = _share(all, _unlockedBps(presale, Context.timestamp()));
  const claimedKey = vestClaimedKey(presale.id, contributor);
  const claimed = Storage.has(claimedKey) ? bytesToU256(Storage.get(claimedKey)) : u256.Zero;
  const tokens = unlocked - claimed;
  if (unlocked == all) {
    _takeContribution(presale.id, contributor);
    if (Storage.has(claimedKey)) Storage.del(claimedKey);
  } else {
    assert(tokens > u256.Zero, 'Nothing to claim before the next unlock');
    Storage.set(claimedKey, u256ToBytes(unlocked));
  }
  Storage.set(escrowedKey(presale.token), u256ToBytes(_escrowed(presale.token) - tokens));
  if (tokens > u256.Zero) _sendTokens(presale.token, contributor, tokens);
  generateEvent(createEvent('CLAIMED', [presale.id.toString(), contributor, tokens.toString()]));
  settle(before, 0);
}

/** Contributor's MAS back after a failure or a cancel. Args: presaleId (u64). */
export function refund(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const presale = _load(new Args(binaryArgs).nextU64().expect('presaleId is missing or invalid'));
  assert(
    presale.status == PRESALE_FAILED || presale.status == PRESALE_CANCELLED,
    'Refunds open only after a failed or cancelled presale',
  );
  const contributor = Context.caller().toString();
  const amount = _takeContribution(presale.id, contributor);
  transferCoins(new Address(contributor), amount);
  generateEvent(createEvent('REFUNDED', [presale.id.toString(), contributor, amount.toString()]));
  settle(before, 0, 0, amount);
}

/**
 * The owner takes the MAS raised, minus the presale fee fixed at creation (success only, once).
 */
export function withdrawRaised(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const presale = _load(new Args(binaryArgs).nextU64().expect('presaleId is missing or invalid'));
  assert(Context.caller().toString() == presale.creator, 'Only the presale owner can withdraw');
  assert(presale.status == PRESALE_SUCCESS, 'Only a successful presale can be withdrawn');
  assert(!presale.withdrawn, 'Already withdrawn');
  presale.withdrawn = true;
  Storage.set(presaleKey(presale.id), presale.serialize());
  const fee = _bps(presale.raised, presale.feeBps);
  addFee(fee);
  const payout = presale.raised - fee;
  transferCoins(new Address(presale.creator), payout);
  generateEvent(
    createEvent('WITHDRAWN', [presale.id.toString(), payout.toString(), fee.toString()]),
  );
  settle(before, 0, 0, payout);
}

/**
 * Puts addresses on a presale's whitelist (its owner, while the presale is open and before its
 * public phase). Already listed ones are skipped. Args: presaleId (u64), addresses (string[],
 * 1-200). Coins: storage, ≈ 0.007 MAS per new address; the rest is refunded.
 */
export function addToWhitelist(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const args = new Args(binaryArgs);
  const presale = _load(args.nextU64().expect('presaleId is missing or invalid'));
  const addresses = args.nextStringArray().expect('addresses is missing or invalid');
  _onlyPresaleOwner(presale);
  assert(presale.whitelist, 'This presale has no whitelist');
  assert(
    presale.status == PRESALE_OPEN && Context.timestamp() < presale.publicFrom,
    'The whitelist is closed',
  );
  _assertBatch(addresses);
  let added: u32 = 0;
  for (let i = 0; i < addresses.length; i++) {
    assert(validateAddress(addresses[i]), 'The list holds an invalid address');
    const key = whitelistKey(presale.id, addresses[i]);
    if (Storage.has(key)) continue;
    Storage.set(key, new StaticArray<u8>(0));
    added++;
  }
  presale.whitelisted += added;
  Storage.set(presaleKey(presale.id), presale.serialize());
  generateEvent(createEvent('WHITELISTED', [presale.id.toString(), added.toString()]));
  settle(before, 0);
}

/**
 * Takes addresses off a presale's whitelist (its owner, any time: after the presale it only
 * frees the storage, refunded to the owner). Unlisted ones are skipped. Args: presaleId (u64),
 * addresses (string[], 1-200).
 */
export function removeFromWhitelist(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const args = new Args(binaryArgs);
  const presale = _load(args.nextU64().expect('presaleId is missing or invalid'));
  const addresses = args.nextStringArray().expect('addresses is missing or invalid');
  _onlyPresaleOwner(presale);
  _assertBatch(addresses);
  let removed: u32 = 0;
  for (let i = 0; i < addresses.length; i++) {
    const key = whitelistKey(presale.id, addresses[i]);
    if (!Storage.has(key)) continue;
    Storage.del(key);
    removed++;
  }
  presale.whitelisted -= removed;
  Storage.set(presaleKey(presale.id), presale.serialize());
  generateEvent(createEvent('UNWHITELISTED', [presale.id.toString(), removed.toString()]));
  settle(before, 0);
}

/**
 * Cancels a presale: by its owner before it starts, by the admin until it is finalized. All
 * tokens wait for the owner (`reclaimTokens`); contributors (if any) take their MAS back with
 * `refund`.
 */
export function cancelPresale(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const presale = _load(new Args(binaryArgs).nextU64().expect('presaleId is missing or invalid'));
  assert(presale.status == PRESALE_OPEN, 'This presale is already closed');
  const caller = Context.caller().toString();
  assert(
    (caller == presale.creator && Context.timestamp() < presale.start) || _isAdmin(caller),
    'Only the owner, before the start, can cancel',
  );
  presale.status = PRESALE_CANCELLED;
  _close(presale, presale.tokensForSale);
  generateEvent(createEvent('PRESALE_CANCELLED', [presale.id.toString()]));
  settle(before, 0);
}

/**
 * The presale owner takes back the tokens a closed presale returns: the unsold ones after a
 * success, all of them after a failure or a cancel. Args: presaleId (u64). Coins: ≈ 0.01 MAS
 * (the entry's storage comes back).
 */
export function reclaimTokens(binaryArgs: StaticArray<u8>): void {
  const before = balance();
  _notLocked();
  const presale = _load(new Args(binaryArgs).nextU64().expect('presaleId is missing or invalid'));
  _onlyPresaleOwner(presale);
  const key = reclaimKey(presale.id);
  assert(Storage.has(key), 'No tokens to take back');
  const tokens = bytesToU256(Storage.get(key));
  Storage.del(key);
  Storage.set(escrowedKey(presale.token), u256ToBytes(_escrowed(presale.token) - tokens));
  _sendTokens(presale.token, presale.creator, tokens);
  generateEvent(createEvent('TOKENS_RECLAIMED', [presale.id.toString(), tokens.toString()]));
  settle(before, 0);
}

// ==================================================== //
// ====                   READS                    ==== //
// ==================================================== //

/** Args: presaleId (u64). Returns Presale. */
export function getPresale(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  return _load(
    new Args(binaryArgs).nextU64().expect('presaleId is missing or invalid'),
  ).serialize();
}

/** Newest first. Args: offset (u64), limit (u32, ≤ 50). Returns Args: total (u64), Presale[]. */
export function getPresales(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const offset = args.nextU64().expect('offset is missing or invalid');
  const limit = args.nextU32().expect('limit is missing or invalid');
  assert(limit > 0 && limit <= MAX_PAGE, 'Limit must be 1-50');
  const total = _count(COUNTER_PRESALE);
  const page: Presale[] = [];
  if (offset < total) {
    let id = total - offset;
    while (id >= 1 && page.length < i32(limit)) {
      page.push(_load(id));
      id--;
    }
  }
  return new Args().add(total).addSerializableObjectArray<Presale>(page).serialize();
}

/** Args: token (string). Returns u64: its open presale id, 0 if none. */
export function presaleOf(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const token = new Args(binaryArgs).nextString().expect('token is missing or invalid');
  const key = presaleActiveKey(token);
  return Storage.has(key) ? Storage.get(key) : u64ToBytes(0);
}

/** Args: presaleId (u64), contributor (string). Returns u64: MAS contributed, not yet taken. */
export function getContribution(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const key = contributionKey(
    args.nextU64().expect('presaleId is missing or invalid'),
    args.nextString().expect('contributor is missing or invalid'),
  );
  return Storage.has(key) ? Storage.get(key) : u64ToBytes(0);
}

/** Args: presaleId (u64), address (string). Returns bool: on the presale's whitelist. */
export function isWhitelisted(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const key = whitelistKey(
    args.nextU64().expect('presaleId is missing or invalid'),
    args.nextString().expect('address is missing or invalid'),
  );
  return boolToByte(Storage.has(key));
}

/**
 * Args: presaleId (u64), contributor (string). Returns u256: token units claimed so far from a
 * vesting presale (0 before the first claim, and again after the last one).
 */
export function getClaimed(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const key = vestClaimedKey(
    args.nextU64().expect('presaleId is missing or invalid'),
    args.nextString().expect('contributor is missing or invalid'),
  );
  return Storage.has(key) ? Storage.get(key) : u256ToBytes(u256.Zero);
}

/**
 * Args: presaleId (u64). Returns u256: token units the presale's owner can take back with
 * `reclaimTokens` (0 before it closes and after they took them).
 */
export function getReclaimable(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const key = reclaimKey(new Args(binaryArgs).nextU64().expect('presaleId is missing or invalid'));
  return Storage.has(key) ? Storage.get(key) : u256ToBytes(u256.Zero);
}

/** Args: contributor (string). Returns Args: ids (u64[]) of presales with a pending share. */
export function getContributionsOf(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const contributor = new Args(binaryArgs).nextString().expect('contributor is missing or invalid');
  const keys = Storage.getKeys(contributionsOfPrefix(contributor));
  const ids: u64[] = [];
  for (let i = 0; i < keys.length; i++) ids.push(u64FromBE(keys[i], keys[i].length - 8));
  return new Args().add(ids).serialize();
}

// ==================================================== //
// ====                  INTERNALS                 ==== //
// ==================================================== //

function _load(id: u64): Presale {
  const key = presaleKey(id);
  assert(Storage.has(key), 'Unknown presale');
  return new Args(Storage.get(key)).nextSerializable<Presale>().unwrap();
}

/** amount (nanoMAS) × rate / 1 MAS, rounded down. */
function _tokensFor(amount: u64, rate: u256): u256 {
  return divU256ByU64(u256.fromU64(amount) * rate, NANO_PER_MAS);
}

/**
 * Share of the bought tokens unlocked at `now`, bps: the first release, plus one cycle's share
 * per cycle completed since min(finalizedAt, end), up to all of them.
 */
export function _unlockedBps(presale: Presale, now: u64): u64 {
  if (presale.vestFirstBps >= BPS_ALL) return BPS_ALL;
  const from = presale.finalizedAt < presale.end ? presale.finalizedAt : presale.end;
  const cycles = now > from ? (now - from) / presale.vestCycleMs : 0;
  const bps = u64(presale.vestFirstBps) + cycles * u64(presale.vestCycleBps);
  return bps < u64(BPS_ALL) ? bps : u64(BPS_ALL);
}

/** amount × bps / 10 000, rounded down, without overflowing a u256. */
export function _share(amount: u256, bps: u64): u256 {
  const whole = divU256ByU64(amount, BPS_ALL);
  const rest = amount - whole * u256.fromU64(BPS_ALL);
  return whole * u256.fromU64(bps) + divU256ByU64(rest * u256.fromU64(bps), BPS_ALL);
}

function _onlyPresaleOwner(presale: Presale): void {
  assert(Context.caller().toString() == presale.creator, 'Only the presale owner can do this');
}

function _assertBatch(addresses: string[]): void {
  assert(
    addresses.length > 0 && addresses.length <= MAX_WHITELIST_BATCH,
    'Send 1-200 addresses at a time',
  );
}

function _bps(amount: u64, bps: u16): u64 {
  return (amount / 10_000) * u64(bps) + ((amount % 10_000) * u64(bps)) / 10_000;
}

function _escrowed(token: string): u256 {
  const key = escrowedKey(token);
  return Storage.has(key) ? bytesToU256(Storage.get(key)) : u256.Zero;
}

/** Standard MRC20 balance of `holder`, read from the token's storage. */
function _balanceIn(token: string, holder: string): u256 {
  const contract = new Address(token);
  const key = mrc20BalanceKey(holder);
  return Storage.hasOf(contract, key) ? bytesToU256(Storage.getOf(contract, key)) : u256.Zero;
}

/**
 * Ends an open presale; `back` tokens stay in escrow for its owner (`reclaimTokens`). No call to
 * the token: closing can't be blocked by its code.
 */
function _close(presale: Presale, back: u256): void {
  Storage.set(presaleKey(presale.id), presale.serialize());
  Storage.del(presaleActiveKey(presale.token));
  if (back > u256.Zero) Storage.set(reclaimKey(presale.id), u256ToBytes(back));
}

/** Deletes the caller's contribution (its storage is refunded) and returns the amount. */
function _takeContribution(presaleId: u64, contributor: string): u64 {
  const key = contributionKey(presaleId, contributor);
  assert(Storage.has(key), 'Nothing to take in this presale');
  const amount = bytesToU64(Storage.get(key));
  Storage.del(key);
  Storage.del(contributionsOfKey(contributor, presaleId));
  return amount;
}

function _sendTokens(token: string, to: string, amount: u256): void {
  _lock();
  call(new Address(token), 'transfer', new Args().add(to).add(amount), TOKEN_TRANSFER_DEPOSIT);
  _unlock();
}

function _notLocked(): void {
  assert(!Storage.has(LOCK_KEY), 'The Launchpad is busy, try again');
}

function _lock(): void {
  Storage.set(LOCK_KEY, bytes(1));
}

function _unlock(): void {
  Storage.del(LOCK_KEY);
}
