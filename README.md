# Grow

**Save the change you already have.**

Grow turns a fraction of any token in your wallet into dollars you keep — in a
separate on-chain account that only you can open. No deposit, no new balance to
fund, no lock-up. You already hold the money; Grow is the part where you decide
to keep some of it.

Built on Solana. Routing by [DFlow](https://pond.dflow.net).

---

## The problem

Everyone who holds crypto already has savings and does not experience them as
savings. A wallet is a spending screen: balances that move, charts, a swap
button. Nothing in it ever says *this part is not for spending*.

Saving apps answer that with deposits — link a bank, move money in, wait. That
is a wall in front of a decision that should take one tap, and it asks for money
the user has to find. Grow asks for money the user is already holding.

## How it works

A **Grow** is one action: pick an amount, pick what it comes out of, confirm.

1. The amount is quoted and the transaction is built by DFlow's `/order`.
2. You sign it in your own wallet.
3. The USDC lands in your **Grow Account** — never back in the spending balance.
4. The confirmed on-chain amount, not the quote, is what the ledger records.

Growing out of USDC skips the router entirely: it is an SPL transfer between two
accounts you already own, so the amount that arrives is the amount in the
instruction.

## The Grow Account

This is the piece worth reading the code for.

Savings need to be *somewhere else* or the separation is a label on a screen. The
first design derived a second keypair from a wallet signature — and that is a
critical vulnerability, not a subtlety: an ed25519 signature is deterministic but
it is **not a secret**, so any site could have asked a user to sign the same
constant string and held the key. It was removed before a lamport ever reached
it.

What ships instead uses no second key at all. One owner may hold many SPL token
accounts for the same mint, so Grow gives the user a second USDC account at an
address derived from their own wallet:

```
address = createWithSeed(wallet pubkey, "grow-usdc-v1", SPL Token program)
```

- Recomputable anywhere from the connected wallet alone — no stored secret, no
  local state, no recovery phrase, no vendor.
- Its token authority is the user's existing wallet, so **only they can move the
  money and Grow never can**.
- It survives a cleared browser, a new device and a new machine, which is why the
  total can be verified on chain by a stranger rather than asserted by the app.

The honest limit, stated in the code as well as here: because the authority is
the user's normal wallet, other Solana software can see and spend that balance.
The guarantee is *the money is genuinely separated on chain*, not *the money
cannot be spent*.

## What runs on Solana

| Piece | How |
| --- | --- |
| Routing and transaction building | DFlow Trading API `GET /order`, with `destinationTokenAccount` pointed at the Grow Account |
| Savings account | `createAccountWithSeed` + `InitializeAccount3`, authority = the user's wallet |
| Portfolio | `getParsedTokenAccountsByOwner` across both Token and Token-2022 programs, plus native SOL |
| Settlement figure | read from the confirmed transaction's `pre/postTokenBalances`, scoped to the destination account |
| Confirmation | polled `getSignatureStatuses` against the order's `lastValidBlockHeight` |

There is no program of our own to deploy. Everything here composes existing
Solana primitives, which is the reason a first-time saver can use it with the
wallet they already have.

### Notes from the integration

Three things cost real time and are worth passing on:

- **`dynamicComputeUnitLimit` is not optional for multi-hop routes.** Without it
  the transaction gets a fixed default budget and a real route walks straight
  through it — measured on mainnet, a USDT Grow died in simulation at
  `consumed 199700 of 199700`.
- **`destinationTokenAccount` must already exist.** DFlow will not create it, and
  without it the swap quietly returns USDC to the spending wallet — the exact
  outcome the whole design exists to prevent.
- **The API key belongs on a backend.** DFlow's own guidance, and the reason
  `backend/` exists: a browser bundle cannot hold a key, and the public Solana
  RPC answers 403 to any request carrying an `Origin` header, so the same proxy
  solves both.

## Architecture

```
src/app/          screens (expo-router)
src/components/   UI, including the wheel picker and the growth animations
src/domain/       pure money logic — ledger, milestones, amounts. No IO.
src/lib/          chain, wallet, DFlow, storage
src/state/        providers: portfolio, Grow Account, ledger, flow
backend/          zero-dependency proxy: DFlow key + Solana RPC
```

`src/domain/` is deliberately free of network and React so the arithmetic that
decides what a user is told can be tested exactly.

## Running it

```bash
npm install
cp .env.example .env        # fill in the two URLs
npm run web
```

The backend proxy, if you are running one locally:

```bash
cp backend/.env.example backend/.env
node backend/server.js
```

⚠️ **This build moves real funds on mainnet.** There is no devnet path — DFlow is
mainnet-only. Grows are capped between **$0.25 and $25** while it is a demo, and
`EXPO_PUBLIC_MOCK_SWAP=1` runs the entire flow against a mock router so a
rehearsal costs nothing.

## Tests

```bash
npm run typecheck    # tsc, clean
npm test             # 238 tests, 32 suites
```

The suites worth looking at are the ones guarding money: `src/domain/__tests__`
for the ledger and the amount ladders, and `src/lib/solana/__tests__` for the
settled-amount read.

## Status

Real money has moved through this on mainnet: swap Grows through DFlow and
direct USDC Grows, on a live wallet.

Not built yet: yield (the design is settled, the deposit path is not written),
the dust sweep, and notifications.

## License

MIT — see [LICENSE](LICENSE).
