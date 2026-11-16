# Fair Launch — how it works

Fair Launch lets anyone launch a memecoin in one transaction, with no capital. Everyone buys on
the same bonding curve, the price rises with each buy. When the curve sells out, the contract
moves the token to Dusa by itself and locks the pool's liquidity for good. No presale, no team
allocation, no owner.

| | |
|---|---|
| Contract | `smart-contract/assembly/contracts/fair-launch.ts` (v1.0.0), separate from the Launchpad |
| Libraries | `assembly/lib/fairlaunch/curve.ts` (math), `assembly/lib/fairlaunch/records.ts` (records) |
| Tests | `assembly/__tests__/curve.spec.ts`, `assembly/__tests__/fair-launch.spec.ts` |
| App | `src/app/core/fairlaunch/` (records mirror, curve mirror, reader), `src/app/features/fair-launch/` (pages `/launch`, `/launch/new`, `/launch/:id`) |
| Deploy | `npm run deploy:fair-launch` in `smart-contract/` → `deployments/fair-launch-<network>.json`; then `fairLaunchAddress` in `src/app/core/network/networks.ts` |

The contract has **no upgrade function**: its code can never change. It has no power over the
tokens it launches either (see "The token").

## Life of a launch

```
createLaunch ──► TRADING ──(the buy that sells out the curve)──► COMPLETE ──(graduate)──► GRADUATED
                 buy / sell                                       deferred call booked     trading on Dusa
```

| State | Value | What works |
|---|---|---|
| `TRADING` | 0 | `buy`, `sell` |
| `COMPLETE` | 1 | `graduate` only (no buy, no sell) |
| `GRADUATED` | 2 | Nothing in the contract: the token trades on Dusa |

## The token

`createLaunch` deploys the token from the **RustCore Launchpad's newest token template**
(RC-Token), read from the Launchpad's own storage (`tplv:`, `tpl:`, `tplh:` keys). It is the same
bytecode the Launchpad launches, with the same verified source; the launch record keeps the
template version and sha256.

Every fair-launch token is the same:

| Property | Value |
|---|---|
| Supply | 1 000 000 000 tokens, fixed (not mintable, not burnable) |
| Decimals | 9 (like MAS), so 10^18 smallest units, which fit a u64 |
| Code | Immutable (`mutable = false`) |
| Owner | The Fair Launch contract at deploy, which **renounces** ownership in the same call |
| Name, symbol | Chosen by the creator; Launchpad rules (3–32 characters, A-Z 0-9 symbol of 2–10) |

The symbol must be free both here and in the Launchpad (`s:<symbol>` key there), and not one of
the reserved symbols (MAS, WMAS, USDC…). The creator also gives the usual `ProjectInfo`
(description, logo, links), stored in the launch record.

Fair-launch tokens are **not** in the Launchpad registry: they don't appear on the Tokens page,
only under Fair launch.

## The supply split

| Part | Tokens | Where it goes |
|---|---|---|
| Curve | 800 000 000 (80 %) | Sold to buyers on the bonding curve |
| Pool | 200 000 000 (20 %) | Paired with the raised MAS on Dusa at graduation |

## The bonding curve

Constant product with **virtual reserves** (the pump.fun model):

```
x = virtualMas + masIn            (MAS side)
y = CURVE_VIRTUAL_TOKENS − sold   (token side)
x · y stays constant
```

- `targetMas` (from the config, fixed in each launch) is the MAS the curve raises when it sells out.
- `virtualMas = targetMas / 3`
- `CURVE_VIRTUAL_TOKENS = 4/3 × 800 M`

With these two values, selling all 800 M tokens brings in exactly `targetMas`, and the curve ends
at the price the pool will have (200 M tokens against ~`targetMas`). The proof: at the end
`y = CURVE_VIRTUAL_TOKENS / 4`, so `x = 4 × virtualMas`, so `masIn = 3 × virtualMas = targetMas`.

**Buy** `m` nanoMAS (after the fee): `tokens = y × m / (x + m)`, rounded down.
If that is more than the curve has left, the buyer gets exactly what's left and pays only
`x × left / (y − left)`, rounded up; the rest of their MAS is refunded.

**Sell** `t` tokens: `mas = x × t / (y + t)`, rounded down, never more than `masIn`.

Rounding always favours the curve, so it can never owe more MAS than it holds.

**Prices.** Start: `targetMas / 3.2 billion` MAS per token. End: 16 × the start price.

| `targetMas` | Start price | Start market cap | End price | End market cap |
|---|---|---|---|---|
| 200 MAS (buildnet default) | 0.0000000625 | 62.5 MAS | 0.000001 | 1 000 MAS |
| 50 000 MAS (mainnet default) | 0.000015625 | 15 625 MAS | 0.00025 | 250 000 MAS |

(Market cap = price × 1 B tokens.)

## Fees

All set by the admin in the config; a launch keeps the values in force when it was created.

| Fee | When | Paid by | Cap in the contract | Default |
|---|---|---|---|---|
| Creation fee | `createLaunch` | Creator | — | 1 MAS |
| Trade fee | Every buy (on top of the MAS spent) and sell (out of the MAS received) | Trader | 2 % | 1 % |
| Graduation fee | At graduation, out of the MAS raised | The pool | 5 % | 2 % |

Fees accumulate in the contract's `fees` counter. The admin can withdraw **only** that counter
(`withdrawFees`); the MAS in the curves is escrow nobody can take out.

Every write also pays its own storage, as in the Launchpad (`settle()`): the caller sends a margin
and gets back what wasn't used. Each buy and sell adds a row to the launch's trade history
(~0.018 MAS of storage, paid by the trader; see "Trade history").

## Trade history (the chart)

The contract keeps every buy and sell of a launch (key `h:` + id + index): time, trader, buy or
sell, the MAS and tokens traded, the curve after it (`sold`, `masIn`) and the operation that made
it (`getOriginOperationId`, for the explorer link). `Launch.trades` is the
count; `getTrades(id, from, limit)` reads them in pages of up to 100, oldest first. With the
curve state in each row, every price is exact: `(virtualMas + masIn) / (CURVE_VIRTUAL_TOKENS −
sold)` MAS per token.

The app builds the chart from it with no indexer (`src/app/core/fairlaunch/chart.ts`): candles
of 1 minute to 1 day, in market cap (price × 1 B, the default) or price, with the MAS traded per
candle under them; each candle opens where the previous trade left the price. The token page
reads the launch again every 4 seconds while the curve trades (only while the tab is visible) and
adds the new trades to the chart and to the trade list (10 to a page; each trader and operation
opens in the explorer where the network has one). The chart is TradingView's open-source
[Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0), loaded only
on the token page.

## Graduation

### When

The `buy` that sells the last token switches the launch to `COMPLETE` and books a **Massa
deferred call** to `graduate(id)` two periods (~32 s) later. This is the "autonomous smart
contract" part: no bot, no server.

- The booking price (`deferredCallQuote`) is paid out of the raised MAS, recorded as `autoFee`.
  The buyer doesn't pay it. It is ~0.01 MAS per million gas + ~0.045 (read on buildnet and
  mainnet on 2026-11-16): **~9.85 MAS** for the default `autoGraduateGas` of 980 M. `graduate`
  used **872.6 M gas** on buildnet (a new pool, one bin step), so 900 M was too tight a margin.
  When the call runs, the node gives the storage part of that price (~0.037 MAS) back to the
  contract, outside any account: it stays there.
- It's skipped if `autoGraduateGas` is 0 in the config, if the booking would cost more than
  5 % of the raised MAS (so below a ~197 MAS target at 980 M gas: the buildnet default is 200),
  or if the slot can't take it (the quote is 0: the slot is full, or the gas is above what one
  deferred call may use — just under 1 B). Booking anyway would fail and revert the buy that
  sells the curve out.
- If the deferred call doesn't run or fails, **anyone** can call `graduate(id)` (the app shows a
  "Move it to Dusa" button). The caller keeps whatever the reserved costs didn't use (see below).
- When the deferred call graduates the launch, the contract is its own caller: what the reserved
  costs didn't use goes to the fees (a refund to itself would leave it in no account).

### The MAS

```
graduationFee = masIn × graduationFeeBps / 10 000      → fees
budget        = masIn − graduationFee − autoFee         → leaves the escrow
poolMas       = budget − GRADUATION_RESERVE             → the pool
```

`GRADUATION_RESERVE` ≈ 12.78 MAS pays the pool's costs:

| Part | Amount |
|---|---|
| `createLBPair` storage (Dusa refunds the unused part; 9.39 MAS measured on buildnet) | 12 MAS |
| `addLiquidityMAS` storage, 11 bins (Dusa's estimate + 20 %) | ~0.77 MAS |
| Allowance for the router | 0.01 MAS |

What the reserve doesn't use goes to whoever called `graduate`, as a reward for finishing the
job (to the fees when the deferred call did it). With a small target the reserve is a large
share: at 100 MAS the pool gets ~85 MAS, so its price starts ~15 % below the curve's last price. From 1 000 MAS up, the gap is about 1 %
(plus the graduation fee).

### The bin

Dusa is a Liquidity Book DEX: the price lives in bins, `price(id) = (1 + binStep / 10 000)^(id − 2^23)`.
The contract computes the active bin for `poolMas / 200 M` itself (`binForPrice`). It uses only
integers: Q64.64 fixed point with binary lifting over `r^(2^j)`. Massa contracts can't use
floats. It picks the highest bin whose price is at most the curve's price.

### The pool

1. For each bin step in `config.binSteps`, in order, the contract asks Dusa's factory
   (`getAllLBPairs`) whether a TOKEN/WMAS pool already exists:
   - **none**: this bin step is chosen and the pool is created;
   - **one at the right price** (its active bin within 1 of ours): it's reused, liquidity is added;
   - **one at another price**: skipped. Anyone can create an empty pool at any price before
     graduation; adding liquidity there would sell the tokens at the wrong price.

   If every bin step is taken at another price, `graduate` fails until the admin adds another bin
   step to the config.
2. `increaseAllowance(router, 200 M)` on the token.
3. `createLBPair(token, WMAS, activeId, binStep)` if the pool is new.
4. `addLiquidityMAS`: 200 M tokens and `poolMas`, Dusa's "spot" shape over 11 bins (5 on each side
   of the price: tokens in the active bin and above, MAS in the active bin and below).
5. The liquidity is sent **to the Fair Launch contract itself**. It has no function to remove
   liquidity, so the pool can never be pulled.

## Functions

### Writes

| Function | Args | Coins | Notes |
|---|---|---|---|
| `createLaunch` | name, symbol, info (`ProjectInfo`), devBuy (u64 nanoMAS), minTokens (u64) | creation fee + token contract storage (~3.9 MAS) + deploy deposit + devBuy + its fee + margin | `devBuy` = optional first buy by the creator, in the same transaction |
| `buy` | id (u64), mas (u64), minTokens (u64) | mas + trade fee + 0.01 MAS + margin | Fails if the price moved below `minTokens` (the app allows 2 %) |
| `sell` | id (u64), tokens (u64), minMas (u64) | 0.01 MAS + margin | Needs `increaseAllowance(fairLaunch, tokens)` on the token first |
| `graduate` | id (u64) | margin (the app sends 1 MAS, refunded) | Anyone; only in `COMPLETE` |

### Reads

| Function | Args | Returns |
|---|---|---|
| `getLaunch` | id | `Launch` record |
| `getLaunches` | before (u64, 0 = newest), limit (u32, ≤ 50) | `Launch[]`, newest first |
| `getLaunchesBy` | creator | ids (u64[]) |
| `getTrades` | id, from (u64, 0 = first trade), limit (u32, ≤ 100) | `Trade[]`, oldest first |
| `launchOfToken` | token | id, 0 if not a fair launch |
| `quoteBuyOf` | id, mas | tokens, mas taken, fee |
| `quoteSellOf` | id, tokens | mas after fee, fee |
| `config`, `fees`, `count`, `admin`, `version` | — | — |

### Admin

| Function | What it can do | What it can't |
|---|---|---|
| `setConfig` | Fees (within the caps), target, bin steps, auto-graduation gas, pause | Change a launch already created (fees and target are fixed in it) |
| `setHidden` | Hide a launch from the app's lists | Stop its trading |
| `withdrawFees` | Take the fees collected | Touch the MAS in any curve |
| `transferAdmin` + `acceptAdmin` | Hand over the role in two steps | — |

**Pause** stops new launches and buys. Sells and graduation keep working, so nobody's MAS is ever
stuck.

## Records

Field order is the encoding (Args has no names). `records.ts` in the contract and in the app must
match; `src/app/core/fairlaunch/records.spec.ts` decodes bytes the contract wrote.

**Launch:** id, token, creator, createdAt, name, symbol, templateVersion, templateHash, virtualMas,
targetMas, tradeFeeBps, graduationFeeBps, sold, masIn, state, autoFee, pair, binStep, graduatedAt,
hidden, info, trades.

**Trade:** time, trader, isBuy, mas, tokens, sold, masIn (the curve after it), opId.

**FairConfig:** creationFee, tradeFeeBps, graduationFeeBps, targetMas, deployDeposit, launchpad,
dusaRouter, dusaFactory, wmas, binSteps (u32[]), autoGraduateGas, paused.

## Events

`LAUNCH_CREATED:id,token,creator` · `BUY:id,buyer,mas,tokens,sold,masIn` ·
`SELL:id,seller,mas,tokens,sold,masIn` · `LAUNCH_COMPLETED:id` · `GRADUATION_SCHEDULED:id,callId` ·
`LAUNCH_GRADUATED:id,pair,binStep` · `CONFIG_UPDATED` · `FEES_WITHDRAWN:amount` · `ADMIN_CHANGED:admin`

## Limits and open points

- **Tried on buildnet (2026-11-16)** with `npx tsx src/e2e-fair-launch.ts` (target 200 MAS): a
  launch with a dev buy, a buy, a sell, the buy that sells out; the deferred call graduated it by
  itself 2 periods later (the contract is its own caller there), the pool was created at the
  expected bin with the 200 M tokens and 174.17 MAS, its 11 bins held by the contract; the fees
  got the graduation fee and the unused reserve, then were withdrawn. After every step the
  contract's balance = fees + MAS in the curves + a constant (+ the deferred call's storage
  refund). The unit tests mock Dusa and the deferred calls (vm-mock): the skip when a slot can't
  take the call (quote 0) is not exercised anywhere.
- **Gas.** `graduate` takes 872.6 M gas for a new pool; each extra bin step it has to look at
  (pools created in advance) adds a little. Past the deferred call's gas, the call fails and the
  launch waits for a manual `graduate` (any account, up to the block's gas limit).
- **Pools created in advance** can block a bin step (see "The pool"); with all of them blocked,
  graduation waits for a new bin step in the config.
- **Small targets** lose a larger share to the pool's costs (see "The MAS").
- **No audit yet**, like the Launchpad.

## Trying it on buildnet

Deployed on buildnet at `AS1m8ZRSWJSUkjQRaKxULTZtXsFXjf6G9v2gLAxdqmP2EaRam93P`
(`deployments/fair-launch-buildnet.json`, target 200 MAS). The earlier ones (without the trade
history; without the operation ids) are in `deployments/history/`.

1. `cd smart-contract && cp .env.example .env`, then set `PRIVATE_KEY` (a buildnet test account).
   The `FAIR_*` values there are the buildnet defaults (target 200 MAS).
2. `npm run deploy:fair-launch`. It writes `deployments/fair-launch-buildnet.json` (move the old
   one to `deployments/history/` first).
3. Put the address in `fairLaunchAddress` (buildnet) in `src/app/core/network/networks.ts`, run
   `npm start`, and select Buildnet.
4. Launch a token on `/launch/new`, buy and sell (the chart and the trade list follow within a few
   seconds), then buy the rest of the curve (~200 MAS).
5. Check that the launch reaches **On Dusa** by itself within a minute, or press "Move it to Dusa".
6. `npx tsx src/e2e-fair-launch.ts` runs all of it and checks the numbers (about the target +
   15 MAS a run; the account must be the Fair Launch admin).
7. `TRADES=1000 WALLETS=30 npx tsx src/stress-fair-launch.ts` is the load test: generated wallets
   trade one new launch at once until it has `TRADES` buys and sells, then it checks that every
   trade was kept, follows the curve from the previous one, and that the fees, each wallet's
   tokens and the contract's balance add up. The launch stays open; the wallets send their MAS
   back.
