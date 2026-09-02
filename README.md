<div align="center">

<img src="assets/icon.png" width="132" alt="Grow" />

# Grow

**Save the change you already have —<br/>
a fraction of any token in your wallet, kept in an account only you can open.**

[![Licence](https://img.shields.io/badge/licence-MIT-365d49?style=flat-square)](LICENSE)
[![Custody](https://img.shields.io/badge/custody-none-365d49?style=flat-square)](#security--custody)
[![Network](https://img.shields.io/badge/network-mainnet-171816?style=flat-square)](#quick-start)
[![Routing](https://img.shields.io/badge/routing-DFlow-171816?style=flat-square)](#notes-from-the-dflow-integration)
[![Tests](https://img.shields.io/badge/tests-238%20passing-365d49?style=flat-square)](#tests)

[Architecture](#architecture) · [Security](#security--custody) · [Backend](backend/README.md) · [DFlow](https://pond.dflow.net)

</div>

---

## What this is

Everyone who holds crypto already has savings and does not experience them as
savings. A wallet is a spending screen: balances that move, a chart, a swap
button. Nothing in it ever says *this part is not for spending.*

Savings apps answer that with a deposit — link a bank, move money in, wait. That
is a wall in front of a decision that should take one tap, and it asks for money
the user still has to find. **Grow asks for money they are already holding.**

A Grow is one action: pick an amount, pick what it comes out of, confirm.

| | What happens | Who holds the money |
| --- | --- | --- |
| **Out of a token** | DFlow routes it to USDC and builds the transaction | you sign it; output goes straight to your Grow Account |
| **Out of dollars** | a plain SPL transfer between two accounts you own | no router, no quote, no slippage |
| **Afterwards** | the confirmed on-chain amount is recorded — never the quote | the account's authority is your own wallet |

<details>
<summary><b>Why the ladder matters more than the number</b></summary>

<br/>

A savings balance is a bad motivator at small amounts: $3.70 is not a milestone,
it is a rounding error. So the total is not the product — the **ladder** is.
Sixteen rungs, from Coffee at $1 to Serious Stack at $10,000, and each one is a
thing you can now afford rather than a number you reached.

The unlock is the payoff the whole app is built around, so it is oversized,
unhurried and never competes with a spinner. And it is honest: a milestone is
only ever promised against DFlow's **guaranteed minimum output**, never against
an estimate. If the floor does not clear the gap, the button just says `Grow $1`
and the unlock arrives as a surprise instead of a broken promise.

</details>

<details>
<summary><b>What the app deliberately never says</b></summary>

<br/>

It never says **pay**, **deposit**, **invest** or **fee**. Nothing is spent —
the money moves from one account you own to another account you own, and the
copy has to survive that being literally true.

The total is always called **grown**, never *held* or *balance*, because it is a
record of what you decided to keep and it does not go down when the market does.
Live holdings are shown beside it everywhere it appears, so the two can never be
mistaken for one another.

</details>

---

## Quick start

```bash
npm install
cp .env.example .env        # fill in the API base URL and an RPC URL
npm run web
```

> [!WARNING]
> **This build moves real funds on mainnet.** There is no devnet path — DFlow is
> mainnet-only. Grows are capped between **$0.25 and $25** while it is a demo.
> Set `EXPO_PUBLIC_MOCK_SWAP=1` to run the entire flow against a mock router,
> which spends nothing and is what every rehearsal should use.

<details>
<summary><b>Environment, and the one thing that catches everybody</b></summary>

<br/>

| Variable | What it does |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | the backend proxy. Every DFlow call and every RPC read goes through it |
| `EXPO_PUBLIC_RPC_URL` | direct Solana node, used only when no proxy is configured |
| `EXPO_PUBLIC_MOCK_SWAP` | rehearsal: the whole state machine, no money |
| `EXPO_PUBLIC_DEMO_MODE` | seeds the local ledger for a demo. Emits nothing, moves nothing |

`EXPO_PUBLIC_*` values are **inlined into the bundle at build time**. Changing
one and restarting is not enough — Metro serves the cached value, and the app
goes on using the old one with nothing on screen to say so. Always
`npx expo start --clear` after editing `.env`.

The backend, if you are running one locally:

```bash
cp backend/.env.example backend/.env
node backend/server.js
```

</details>

---

## Architecture

```
src/app/          screens (expo-router)
src/components/   UI — the wheel picker, the plant, the unlock moment
src/domain/       pure money logic: ledger, milestones, amount ladders. No IO.
src/lib/          chain, wallet, DFlow, prices, storage
src/state/        providers: portfolio, Grow Account, ledger, flow
backend/          zero-dependency proxy: holds the DFlow key, relays Solana RPC
```

There is **no program of our own to deploy.** Everything composes existing
Solana primitives, which is exactly why someone can use this with the wallet
they already have and nothing else.

| Piece | How |
| --- | --- |
| Routing and transaction building | DFlow `GET /order`, with `destinationTokenAccount` pointed at the Grow Account |
| Savings account | `createAccountWithSeed` + `InitializeAccount3`, authority = the user's wallet |
| Portfolio | `getParsedTokenAccountsByOwner` across Token **and** Token-2022, plus native SOL |
| Settled amount | read from the confirmed transaction's `pre/postTokenBalances`, scoped to the destination |
| Confirmation | polled `getSignatureStatuses` against the order's `lastValidBlockHeight` |

<details>
<summary><b>The Grow Account — savings with no second key</b></summary>

<br/>

Savings have to be *somewhere else* or the separation is a label on a screen.

The first design derived a second keypair from a wallet signature. That is a
**critical vulnerability, not a subtlety**: an ed25519 signature is
deterministic but it is not a secret — signatures exist to be handed out and
verified — and the derivation message was a public constant in the source. Any
site could have asked a user to sign that exact string, hashed it forward, and
held the key. It was removed before a lamport ever reached it.

What ships uses no second key at all. One owner may hold many SPL token accounts
for the same mint, so Grow gives the user a second USDC account at an address
derived from their own wallet:

```
address = createWithSeed(wallet pubkey, "grow-usdc-v1", SPL Token program)
```

- Recomputable anywhere from the connected wallet alone — no stored secret, no
  local state, no recovery phrase, no vendor.
- Token authority is the user's existing wallet, so **only they can move the
  money and Grow never can.**
- It survives a cleared browser, a new device and a new machine, which is what
  lets the total be checked on chain by a stranger rather than asserted by us.

</details>

<details>
<summary><b>Notes from the DFlow integration</b></summary>

<br/>

Three things cost real time and are worth passing on.

**`dynamicComputeUnitLimit` is not optional for multi-hop routes.** Without it
the transaction gets a fixed default budget and a real route walks straight
through it. Measured on mainnet on a USDT Grow: Jupiter's program burned 139,654
CUs, then DFlow's own program hit `consumed 199700 of 199700` and the whole
thing died in simulation. Nothing was spent, and nothing on screen explained why.

**`destinationTokenAccount` must already exist.** DFlow will not create it, and
without it the swap quietly returns USDC to the spending wallet — the exact
outcome this entire design exists to prevent. So opening the Grow Account is a
separate one-time transaction that happens before the first Grow, not alongside
it.

**The API key belongs on a backend.** DFlow's own guidance, and the reason
`backend/` exists at all. It solves a second problem for free: the public Solana
RPC answers **403 to any request carrying an `Origin` header** — every method,
`getBalance` included — while serving the identical call from a server. One
proxy, two problems.

</details>

<details>
<summary><b>Why the domain layer has no network and no React</b></summary>

<br/>

`src/domain/` decides what a user is told about their own money: what a Grow is
worth, which milestone it unlocks, how much to ask for, how many days it has
been growing. All of it is pure, so all of it is tested exactly rather than
approximately.

That is also where the sharpest bugs have been. The recovered-total figure was
once a live `max(ledger, kept)` — which absorbed each new Grow instead of adding
to it, so a Grow that genuinely crossed a milestone unlocked nothing and skipped
its own celebration. It is a pinned constant now, with the reasoning in the code
and a test that fails if anyone unpins it.

</details>

---

## Status

Real money has moved through this on mainnet — swap Grows through DFlow and
direct USDC Grows, on a live wallet.

| | |
| --- | --- |
| **Works** | the money path, the ladder, onboarding, the walkthrough and guided tour, the Grow Account with open and withdraw |
| **Designed, not built** | yield — supplying to Kamino; the shape is settled, the deposit path is not written |
| **Not started** | notifications, gifting, the dust sweep |

## Tests

```bash
npm run typecheck    # tsc, clean
npm test             # 238 tests, 32 suites
```

The suites worth reading are the ones guarding money: `src/domain/__tests__` for
the ledger and the amount ladders, and `src/lib/solana/__tests__` for the
settled-amount read — the one that proves the dollars landed in the savings
account and not back in the spending balance.

---

## Security & custody

**Grow never holds anyone's money and cannot move it.** There is no custodial
account, no second keypair, no server-side signer. Every transaction is signed
in the user's own wallet, and the savings account's authority is that same
wallet.

The honest limit, stated here exactly as it is stated in the code: because the
authority is the user's normal wallet, other Solana software that enumerates
token accounts can see and spend that balance. The guarantee is *the money is
genuinely separated on chain* — not *the money cannot be spent.*

The backend holds one secret, the DFlow API key, and forwards only an explicit
allowlist of query parameters and RPC methods. It is zero-dependency by design:
nothing to install, nothing to audit, nothing to break on deploy.

---

### Built by

[@Medniyy](https://github.com/Medniyy) · MIT licensed
