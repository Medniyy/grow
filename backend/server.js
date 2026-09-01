import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Grow backend — the DFlow and Solana RPC proxy (Q13).
 *
 * Deliberately zero-dependency: Node 22 has global `fetch`, so there is nothing
 * to install, nothing to audit and nothing to break on deploy.
 *
 *   GET  /health        liveness
 *   GET  /order?...     forwarded to DFlow with the key attached, if there is one
 *   POST /rpc           forwarded to a Solana JSON-RPC node
 *
 * Both exist for the same reason: a browser cannot reach either upstream
 * directly. DFlow's Trading API sends no CORS headers at all, and Solana's
 * public RPC rejects any request carrying an `Origin` header with a flat 403 —
 * measured 2026-08-30, on every method including `getBalance`. The identical
 * call from a server, with no `Origin`, is served normally. That 403 is what
 * made the portfolio read fail silently and Grow report "Nothing ready to grow"
 * on a funded wallet.
 *
 * NOT here yet: gasless. Sponsored swaps need a sponsor keypair that co-signs
 * server-side, which means a funded mainnet wallet and a signing endpoint. The
 * proxy existing is the prerequisite; the sponsor is a deliberate next step.
 */

/**
 * Local config for `node server.js` on a laptop — `backend/.env`, gitignored.
 *
 * A REAL environment variable always wins over this file (Node's loader does
 * not overwrite what is already set), so Railway's own variables stay the
 * authority and a .env that rides along in an upload cannot take over a
 * deployment. Resolved next to this file, not to the working directory.
 */
const envFile = join(dirname(fileURLToPath(import.meta.url)), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = process.env.PORT || 8787;

// The production endpoint 403s without a key. The developer endpoint is keyless
// and, despite its name, also serves MAINNET — there is no devnet path (Q14).
const PRODUCTION = 'https://quote-api.dflow.net';
const DEVELOPER = 'https://dev-quote-api.dflow.net';

const API_KEY = process.env.DFLOW_API_KEY || '';
const UPSTREAM = API_KEY ? PRODUCTION : DEVELOPER;

/** Comma-separated origins, or `*` while developing. */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

/**
 * The Solana node.
 *
 * ⚠️ THE DEFAULT IS A FALLBACK, NOT A CONFIGURATION. `api.mainnet-beta.solana.com`
 * served this proxy fine on 2026-08-30 and by 2026-08-31 was refusing the
 * connection outright from Railway — `fetch failed`, no HTTP response at all,
 * while the same call from a laptop returned 200. Public Solana endpoints block
 * cloud egress ranges, and a datacentre deployment is exactly what this is.
 *
 * The failure is total and invisible from the app: every portfolio read, the
 * Grow Account balance and every confirmation go through here. Set
 * `SOLANA_RPC_URL` to a real provider for any deployment.
 */
const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

/**
 * A bare Helius key is accepted where a URL is expected.
 *
 * The dashboard puts the KEY under your thumb and the full URL two clicks away,
 * so the key is what gets pasted. Rejecting it is not a safe failure: the value
 * would not parse, every read would die, and the app would report an empty
 * wallet — the same silent dead end as no configuration at all. Which form was
 * supplied is printed at boot, so this is forgiving without being magic.
 */
function resolveRpc(configured) {
  if (!configured) return { url: DEFAULT_RPC_URL, form: 'default (public endpoint)' };
  if (/^https?:\/\//.test(configured)) return { url: configured, form: 'url' };
  return {
    url: `https://mainnet.helius-rpc.com/?api-key=${configured}`,
    form: 'bare Helius key',
  };
}

const { url: RPC_URL, form: RPC_FORM } = resolveRpc(process.env.SOLANA_RPC_URL);

/**
 * Host only — never the full URL.
 *
 * Every RPC provider carries its key in the URL (`?api-key=`, or a path
 * segment), so echoing `RPC_URL` anywhere client-visible publishes the key to
 * anyone who calls `/health`.
 */
const rpcHost = (() => {
  try {
    return new URL(RPC_URL).host;
  } catch {
    return 'invalid-url';
  }
})();

/** The real reason behind Node's flat `fetch failed`, which hides it in `cause`. */
function failureReason(error) {
  const cause = error?.cause;
  return cause?.code || cause?.message || error?.message || 'unknown';
}

/**
 * Exactly the JSON-RPC methods Grow calls, and nothing else. An open forwarder
 * would let anyone use this deployment as a free RPC and burn the rate limit.
 *
 * ⚠️ EVERY ENTRY IS PAIRED WITH ITS CALLER. An incomplete list fails in the
 * worst possible way: the proxy answers `method_blocked`, the client throws, and
 * the feature simply does not appear — no crash, no error on screen, nothing to
 * search for. Three methods were missing on the first pass, and one of them,
 * `getTransaction`, would have let real Grows broadcast and then never confirm.
 * Adding a chain call means adding it here in the same change.
 */
const ALLOWED_RPC_METHODS = new Set([
  'getBalance', //                        portfolio: native SOL
  'getTokenAccountsByOwner', //           portfolio + Grow Account balance
  'getAccountInfo', //                    Grow Account existence, lookup tables
  'getMultipleAccounts', //               batched account reads inside web3.js
  'getMinimumBalanceForRentExemption', // opening the Grow Account
  'getLatestBlockhash', //                every transaction we build ourselves
  'sendTransaction', //                   broadcast
  'getSignatureStatuses', //              confirmation polling
  'getBlockHeight', //                    expiry detection
  'getSlot', //                           confirmTransaction internals
  'getTransaction', //                    reading the confirmed USDC delta
  'getSignaturesForAddress', //           when the Grow Account was opened
]);

/** A single batch may not be used to smuggle in unlimited work. */
const MAX_RPC_BATCH = 10;
const MAX_RPC_BODY_BYTES = 256 * 1024;

/** Only these reach DFlow. An unknown parameter is dropped, never forwarded. */
const ALLOWED_PARAMS = new Set([
  'inputMint',
  'outputMint',
  'amount',
  'userPublicKey',
  // Where the output lands. NOT optional in practice: without it the swap
  // returns USDC to the spending wallet and the Grow Account stays empty.
  'destinationTokenAccount',
  'destinationWallet',
  'slippageBps',
  'platformFeeBps',
  'feeAccount',
  'wrapAndUnwrapSol',
  'prioritizationFeeLamports',
  'dynamicComputeUnitLimit',
]);

/**
 * `Access-Control-Allow-Headers` is only read off a preflight response, and it
 * must cover every header the browser announces. `@solana/web3.js` sends
 * `solana-client` on every RPC call, so a hardcoded `content-type` failed the
 * preflight and the fetch died before a request was ever made — visible only as
 * a bare "Failed to fetch". Reflecting what was asked for keeps that from
 * happening again the next time a client library adds a header.
 */
const DEFAULT_ALLOWED_HEADERS = 'content-type, solana-client';

function cors(res, req) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req?.headers['access-control-request-headers'] || DEFAULT_ALLOWED_HEADERS,
  );
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    cors(res, req);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      upstream: UPSTREAM,
      keyed: Boolean(API_KEY),
      rpc: rpcHost,
      rpcConfigured: RPC_URL !== DEFAULT_RPC_URL,
    });
    return;
  }

  if (url.pathname === '/rpc') {
    if (req.method !== 'POST') {
      json(res, 405, { msg: 'POST only', code: 'method_not_allowed' });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(await readBody(req, MAX_RPC_BODY_BYTES));
    } catch {
      json(res, 400, { msg: 'body must be JSON-RPC', code: 'bad_request' });
      return;
    }

    const calls = Array.isArray(payload) ? payload : [payload];
    if (calls.length === 0 || calls.length > MAX_RPC_BATCH) {
      json(res, 400, { msg: `batch of 1..${MAX_RPC_BATCH}`, code: 'bad_request' });
      return;
    }

    const blocked = calls.find((call) => !ALLOWED_RPC_METHODS.has(call?.method));
    if (blocked) {
      json(res, 403, { msg: `method not allowed: ${blocked?.method}`, code: 'method_blocked' });
      return;
    }

    try {
      // No `Origin` header is forwarded — that header is precisely what makes
      // the public node answer 403.
      const upstream = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await upstream.text();

      cors(res);
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(body);
    } catch (error) {
      // The reason travels to the client on purpose. `fetch failed` with the
      // cause dropped means the only trace of a dead RPC lives in a log nobody
      // is reading during a demo, and the app can only say "network".
      const reason = failureReason(error);
      json(res, 502, { msg: `rpc unreachable (${rpcHost}: ${reason})`, code: 'rpc_error' });
      console.error(`rpc proxy error: ${rpcHost}: ${reason}`);
    }
    return;
  }

  if (url.pathname !== '/order' || req.method !== 'GET') {
    json(res, 404, { msg: 'not found', code: 'not_found' });
    return;
  }

  const forwarded = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (ALLOWED_PARAMS.has(key)) forwarded.set(key, value);
  }

  if (!forwarded.has('inputMint') || !forwarded.has('outputMint') || !forwarded.has('amount')) {
    json(res, 400, { msg: 'inputMint, outputMint and amount are required', code: 'bad_request' });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/order?${forwarded.toString()}`, {
      headers: API_KEY ? { 'x-api-key': API_KEY } : {},
    });
    const body = await upstream.text();

    cors(res);
    res.writeHead(upstream.status, { 'content-type': 'application/json' });
    res.end(body);
  } catch (error) {
    // Never leak the key or the upstream URL into a client-visible error.
    json(res, 502, { msg: 'upstream unavailable', code: 'upstream_error' });
    console.error('proxy error:', failureReason(error));
  }
});

server.listen(PORT, () => {
  console.log(`Grow proxy on :${PORT}`);
  console.log(`  /order -> ${UPSTREAM} (${API_KEY ? 'keyed' : 'keyless dev'})`);
  console.log(`  /rpc   -> ${rpcHost} (${RPC_FORM})`);
  if (RPC_URL === DEFAULT_RPC_URL) {
    console.warn(
      '  ⚠️ SOLANA_RPC_URL is unset. The public endpoint blocks cloud egress, so' +
        ' every chain read will fail from a hosted deployment.',
    );
  }
});
