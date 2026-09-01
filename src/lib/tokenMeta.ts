/**
 * What a token is CALLED.
 *
 * `config/tokens.ts` knows four mints, and `symbolFor` fell back to the first
 * four characters of the address for everything else — so a wallet holding
 * Unicorn offered the user a chip reading `UWUy…`. A first-time saver has no
 * idea what a mint address is, and should never be shown one.
 *
 * `api.jup.ag/tokens/v2/search` is keyless, sends browser CORS, batches by
 * comma-separated mint in `query`, and returns name, symbol, icon and decimals.
 * The pinned mints in `config/tokens.ts` stay authoritative for the money path;
 * this is only ever used for display.
 */
const SEARCH_ENDPOINT = 'https://api.jup.ag/tokens/v2/search';

/** The API caps a query; Grow never shows more than a handful anyway. */
const MAX_PER_CALL = 50;

export type TokenMeta = {
  readonly mint: string;
  readonly symbol: string;
  readonly name: string;
  readonly icon: string | null;
};

type SearchResult = {
  id?: string;
  symbol?: string;
  name?: string;
  icon?: string;
};

/** Resolved names, kept for the session. Mints do not get renamed. */
const cache = new Map<string, TokenMeta>();

export function cachedMeta(mint: string): TokenMeta | undefined {
  return cache.get(mint);
}

/**
 * Names for these mints. Never throws and never rejects: a missing name must
 * degrade to the existing short-address fallback, not break the portfolio.
 */
export async function fetchTokenMeta(
  mints: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, TokenMeta>> {
  const wanted = [...new Set(mints)].filter((m) => !cache.has(m));

  if (wanted.length > 0) {
    for (let i = 0; i < wanted.length; i += MAX_PER_CALL) {
      const batch = wanted.slice(i, i + MAX_PER_CALL);
      try {
        const response = await fetch(`${SEARCH_ENDPOINT}?query=${batch.join(',')}`, { signal });
        if (!response.ok) continue;

        const body = (await response.json()) as SearchResult[];
        if (!Array.isArray(body)) continue;

        for (const item of body) {
          if (!item?.id || !item.symbol) continue;
          cache.set(item.id, {
            mint: item.id,
            symbol: item.symbol,
            name: item.name || item.symbol,
            icon: item.icon || null,
          });
        }
      } catch {
        // An unnamed token is a display nuisance, never a failed portfolio read.
      }
    }
  }

  const found = new Map<string, TokenMeta>();
  for (const mint of mints) {
    const meta = cache.get(mint);
    if (meta) found.set(mint, meta);
  }
  return found;
}
