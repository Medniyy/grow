/**
 * Prices — Q12.
 *
 * `api.jup.ag/price/v3` is keyless with browser CORS at a measured 5 req/s, and
 * is batched by `ids`, so one call covers the whole portfolio per refresh.
 *
 * Do NOT use `lite-api.jup.ag` (sunset 31 Jan 2026) or Price API V2 (deprecated).
 * Unpriceable mints are omitted from the response entirely, so every lookup must
 * be guarded rather than assumed present.
 */
const PRICE_ENDPOINT = 'https://api.jup.ag/price/v3';

export type TokenPrice = {
  readonly usd: number;
  /**
   * Move over the last 24h, as a PERCENT (2.28 means +2.28%), not a fraction.
   *
   * ⚠️ Verified by reading USDC, which returned `-0.0138`. As a percent that is
   * a stablecoin holding its peg; as a fraction it would be a 1.4% depeg. The
   * scale matters: the whole daily opportunity is computed from this number, and
   * reading it as a fraction overstates every move by 100x.
   *
   * Zero when the response omits it — never guessed.
   */
  readonly change24hPct: number;
};

export type PriceMap = Readonly<Record<string, TokenPrice>>;

type PriceEntry = { usdPrice?: number; priceChange24h?: number } | undefined;

export async function fetchPrices(mints: readonly string[], signal?: AbortSignal): Promise<PriceMap> {
  const unique = [...new Set(mints)];
  if (unique.length === 0) return {};

  const response = await fetch(`${PRICE_ENDPOINT}?ids=${unique.join(',')}`, { signal });
  if (!response.ok) return {};

  const body = (await response.json()) as Record<string, PriceEntry>;

  const prices: Record<string, TokenPrice> = {};
  for (const mint of unique) {
    const entry = body[mint];
    const usd = entry?.usdPrice;
    if (typeof usd !== 'number' || !Number.isFinite(usd)) continue;

    const change = entry?.priceChange24h;
    prices[mint] = {
      usd,
      change24hPct: typeof change === 'number' && Number.isFinite(change) ? change : 0,
    };
  }
  return prices;
}
