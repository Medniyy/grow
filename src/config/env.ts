/**
 * Environment. Everything is read through here so no module reaches into
 * `process.env` directly.
 *
 * Only `EXPO_PUBLIC_*` variables exist on the client, and they are inlined into
 * the bundle at build time. Nothing secret may ever live here — the DFlow
 * production key stays behind the Railway proxy (SPEC §13, Q13).
 */

const str = (v: string | undefined, fallback: string) =>
  v === undefined || v === '' ? fallback : v;

const bool = (v: string | undefined) => v === '1' || v === 'true';

export const env = {
  /** Q14: mainnet, real funds. There is no devnet path — DFlow is mainnet-only. */
  cluster: 'mainnet-beta' as const,

  rpcUrl: str(process.env.EXPO_PUBLIC_RPC_URL, 'https://api.mainnet-beta.solana.com'),

  /** Railway backend. Proxies DFlow so the production key never ships in a bundle. */
  apiBaseUrl: str(process.env.EXPO_PUBLIC_API_BASE_URL, ''),

  /**
   * Env-gated Demo Mode (Q14). Seeds the LOCAL LEDGER to a larger state for the
   * near-miss moment. Never emits a real social event, never moves real money.
   */
  demoMode: bool(process.env.EXPO_PUBLIC_DEMO_MODE),

  /** ADR-001: devnet-only local signer for wallet plumbing. Never the money path. */
  demoWallet: bool(process.env.EXPO_PUBLIC_DEMO_WALLET),

  /** Stage 3 builds against the mock swap port so rehearsal costs nothing. */
  mockSwap: bool(process.env.EXPO_PUBLIC_MOCK_SWAP),

  /**
   * Permission to fall back to DFlow's keyless developer endpoint.
   *
   * ⚠️ OFF BY DEFAULT, ON PURPOSE. With no proxy configured the client used to
   * fall back to that endpoint silently, and the comment beside the fallback
   * said "never for production" while nothing enforced it. Since
   * `EXPO_PUBLIC_*` values are inlined at BUILD time and a plain rebuild happily
   * ships a stale one, a launch build with an empty API base URL would have gone
   * out quietly pointed at a keyless, rate-limited, unkeyed endpoint — and the
   * first sign of it would have been a demo failing in front of people.
   *
   * Local work opts in; a build that forgets the proxy fails loudly instead.
   */
  allowDevEndpoint: bool(process.env.EXPO_PUBLIC_ALLOW_DEV_ENDPOINT),
} as const;
