/**
 * Kamino — what the capital could be doing.
 *
 * Read-only for now: keyless, no SDK, no transaction, no custody. It exists so
 * the app can answer "and then what?" honestly instead of leaving the capital
 * looking inert.
 *
 * The real integration is NOT blocked by tooling. Kamino builds unsigned
 * transactions server-side —
 *
 *     POST /ktx/klend/deposit   { wallet, market, reserve, amount } -> { transaction }
 *     POST /ktx/klend/withdraw  { wallet, market, reserve, amount } -> { transaction }
 *
 * which is the same fetch -> sign -> broadcast -> confirm shape already built for
 * DFlow. No `klend-sdk`, so none of the Anchor bundling risk that got Streamflow
 * cut. What is left to decide is product, not plumbing: `earned` can go DOWN
 * (protocol risk), which collides with Q1's one-directional ledger, and "you keep
 * the capital" becomes "your capital is in a lending protocol".
 *
 * Grow only ever SUPPLIES. It never borrows, and it never touches a two-sided
 * liquidity position — a first-time saver must not be exposed to impermanent
 * loss or to liquidation.
 */
const API = 'https://api.kamino.finance';

/** The primary Kamino lending market (renamed by Kamino to "SOL/BTC Market"). */
export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

/**
 * The USDC reserve: deepest liquidity, single-asset supply.
 *
 * ⚠️ Pinned by pubkey deliberately. The market carries SEVERAL USDC reserves and
 * most hold nothing — selecting by symbol lands on a dead one quoting 0%.
 */
export const KAMINO_USDC_RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59';

export type ReserveRate = {
  readonly symbol: string;
  /** Fraction, not percent: 0.0358 is 3.58%. */
  readonly supplyApy: number;
  readonly asOf: string;
};

type HistorySample = {
  timestamp: string;
  metrics: { symbol?: string; supplyInterestAPY?: number };
};

/**
 * The supply rate a lender actually receives.
 *
 * ⚠️ Read from the HISTORY endpoint's `supplyInterestAPY`, NOT from
 * `/reserves/metrics`'s `supplyApy`. Those two fields disagree: measured
 * 2026-08-29, metrics said 5.73% while the reserve page showed 3.59%, and
 * `supplyInterestAPY` said 3.584% — matching the UI, as does `borrowInterestAPY`
 * at 5.405% against a displayed 5.41%. The metrics figure runs about 1.6x high
 * (it appears to be gross, before the 10% protocol take rate). Displaying it
 * would overstate a user's yield by more than half.
 */
export async function fetchUsdcSupplyRate(signal?: AbortSignal): Promise<ReserveRate | null> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 36 * 60 * 60 * 1000);
    const query = new URLSearchParams({
      env: 'mainnet-beta',
      start: start.toISOString(),
      end: end.toISOString(),
    });

    const response = await fetch(
      `${API}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/${KAMINO_USDC_RESERVE}/metrics/history?${query}`,
      { signal },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as { history?: HistorySample[] };
    const samples = body.history ?? [];
    const latest = samples[samples.length - 1];

    const apy = latest?.metrics?.supplyInterestAPY;
    if (typeof apy !== 'number' || !Number.isFinite(apy) || apy <= 0) return null;

    return {
      symbol: latest.metrics.symbol ?? 'USDC',
      supplyApy: apy,
      asOf: latest.timestamp,
    };
  } catch {
    // A rate we cannot read is simply not shown. It is never load-bearing.
    return null;
  }
}

/** Yield on a balance over a year, in micro-USD. Display only. */
export function annualYieldMicro(balanceMicro: number, supplyApy: number): number {
  return Math.round(balanceMicro * supplyApy);
}
