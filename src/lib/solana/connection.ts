import { Connection } from '@solana/web3.js';

import { env } from '../../config/env';

let cached: Connection | null = null;

/**
 * Where the RPC calls actually go.
 *
 * Through the backend when one is configured. This is not an optimisation: the
 * public Solana endpoint answers **403 to any request carrying an `Origin`
 * header** — every method, `getBalance` included — while serving the identical
 * call from a server. A browser therefore cannot talk to it at all, and the
 * failure surfaced as an empty portfolio rather than an error.
 *
 * `env.rpcUrl` remains the direct address, and is used when no backend is set
 * or when it names a private node that does accept browser origins.
 */
function rpcEndpoint(): string {
  if (env.apiBaseUrl) return `${env.apiBaseUrl.replace(/\/$/, '')}/rpc`;
  return env.rpcUrl;
}

/** Q9 — `confirmed` is the commitment that unlocks the UI. */
export function connection(): Connection {
  if (!cached) cached = new Connection(rpcEndpoint(), 'confirmed');
  return cached;
}
