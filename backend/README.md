# Grow backend

Zero-dependency DFlow proxy. Exists for two reasons: the production DFlow key
never ships in a browser bundle, and the DFlow Trading API sends
no CORS headers, so a browser cannot call it directly at all.

    GET /health
    GET /order?inputMint=&outputMint=&amount=&userPublicKey=&slippageBps=

Only whitelisted query parameters are forwarded; anything else is dropped.

## Live

**https://grow-proxy-production.up.railway.app** — deployed 2026-08-30, Railway
project `grow-dflow-proxy`, service `grow-proxy`.

    $ curl .../health
    {"ok":true,"upstream":"https://dev-quote-api.dflow.net","keyed":false}

`keyed:false` is the state to expect: no production key is set, so the proxy
forwards to DFlow's **keyless developer endpoint**, which serves mainnet exactly
as the production one does — same features, lower rate limits, "for testing
only" per DFlow's own endpoint docs. Setting `DFLOW_API_KEY` on the Railway
service flips `UPSTREAM` to production; the app needs no change and no rebuild.

Verified live end to end on 2026-08-30: a 0.01 SOL -> USDC order returned a v0
`VersionedTransaction` that deserializes with one required signature, the user as
fee payer, 4 instructions and 2 address-table lookups.

## The API key is no longer on the critical path

The keyless endpoint means the demo does not wait on DFlow's 2–5 day key
turnaround. What the key buys is headroom: the dev endpoint's rate limit is per
DFlow's docs "intended for testing", which is fine for one presenter and not for
a room. Request it anyway — https://pond.dflow.net/get-started/api-key — and set
it as a Railway variable if it arrives in time.

`ALLOWED_ORIGIN` is currently `*`. Tighten it to the web origin once the app is
deployed somewhere; with no key held there is nothing to steal in the meantime,
only quota.

## The Solana RPC is the part that breaks

`SOLANA_RPC_URL` is **required for any deployment**. The fallback is
`api.mainnet-beta.solana.com`, and on 2026-08-31 it stopped answering this
proxy entirely:

    $ curl .../rpc -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["EYv6..."]}'
    {"msg":"rpc unavailable","code":"rpc_error"}          # HTTP 502
    $ railway logs | grep rpc
    rpc proxy error: fetch failed                         # x8

`fetch failed` with no HTTP response means the connection never opened. The
identical call from a laptop returns 200, and `/order` through the same
deployment works — so outbound fetch is fine and it is this endpoint refusing
Railway specifically. Public Solana endpoints block cloud egress ranges. The
`server.js` comment claiming "the public endpoint works server-side" was
measured on 2026-08-30 and was true for one day.

The blast radius is everything: the portfolio read, the Grow Account balance and
every confirmation go through `/rpc`, and the app renders the failure as an
empty wallet. Set it:

    railway variables --service grow-proxy --set SOLANA_RPC_URL='https://mainnet.helius-rpc.com/?api-key=...'

Helius' free tier is enough for a demo. `/health` reports `rpcConfigured` so the
default is visible without a chain call, and only the **host** — never the URL,
which carries the key.

## Run locally

    node server.js            # :8787, keyless dev endpoint

`backend/.env` (gitignored, copy `.env.example`) is loaded on startup for local
runs. A real environment variable always wins over it, so Railway's variables
stay the authority.

⚠️ `railway up --no-gitignore` uploads `backend/.env` with everything else.
That is not a public leak — it is your own image — but keep the key in a Railway
variable, which is where the deployment actually reads it from.

Point the app at it:

    EXPO_PUBLIC_API_BASE_URL=http://localhost:8787

## Redeploy

From this directory:

    railway up --service grow-proxy --ci --no-gitignore

`--no-gitignore` matters: the repo root's `.gitignore` would otherwise strip
files out of the upload archive.

To add the production key later:

    railway variables --service grow-proxy --set DFLOW_API_KEY=...
    railway variables --service grow-proxy --set ALLOWED_ORIGIN=https://<web-origin>

## Not here yet: gasless

Sponsored swaps need a sponsor keypair that co-signs server-side (`sponsor=` plus
`sponsorExec=false` on the DFlow order). That requires a funded mainnet wallet
and a signing endpoint. This proxy is the prerequisite for it, not the thing
itself.
