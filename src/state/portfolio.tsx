import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { MAX_DISPLAYED_TOKENS, MIN_DISPLAY_VALUE_USD } from '../config/limits';
import { USDC } from '../config/tokens';
import { holdingValueMicro } from '../domain/growPlan';
import type { MicroUsd } from '../domain/money';
import { fetchHoldings, symbolFor } from '../lib/solana/balances';
import { fetchPrices } from '../lib/prices';
import { fetchTokenMeta } from '../lib/tokenMeta';
import { useWallet } from '../lib/wallet';
import { useGrowAccount } from './growAccount';

export type PortfolioEntry = {
  readonly mint: string;
  readonly symbol: string;
  /** Full name, for a chip that must never read like an address. */
  readonly name: string;
  readonly icon: string | null;
  readonly decimals: number;
  readonly amountAtomic: bigint;
  readonly priceUsd: number;
  /** Move over 24h as a PERCENT. Drives the daily opportunity — see `lib/prices`. */
  readonly change24hPct: number;
  readonly valueMicro: MicroUsd;
  /**
   * The token account a Grow moves money OUT of, when it is a transfer rather
   * than a swap. Only USDC needs it: one instruction drains one account, so the
   * amount on offer has to be what that account holds, not what the wallet
   * holds in total.
   */
  readonly sourceAccount?: string;
};

type PortfolioState = {
  readonly loading: boolean;
  /** What the user can Grow FROM. Spam-filtered per Q12. */
  readonly growable: readonly PortfolioEntry[];
  /**
   * Live wallet USDC — Q1's second number. Displayed beside `grown`, never
   * summed into it, so a profile can never claim a total over an empty wallet.
   */
  readonly holding: MicroUsd | null;
  /**
   * Set when the READ failed, as opposed to succeeding and finding nothing.
   *
   * These were once the same state, and the screen told a funded user to "add
   * SOL to this wallet" while the real cause was the RPC answering 403. An
   * empty list must never be allowed to mean two different things.
   */
  readonly error: string | null;
  refresh(): void;
};

const PortfolioContext = createContext<PortfolioState | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  // This provider sits INSIDE GrowAccountProvider so it can leave the savings
  // account out of the spendable balance.
  const { address: growAccountAddress } = useGrowAccount();
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<readonly PortfolioEntry[]>([]);
  const [holding, setHolding] = useState<MicroUsd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    if (!publicKey) {
      setEntries([]);
      setHolding(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const holdings = await fetchHoldings(
          publicKey,
          growAccountAddress ? new Set([growAccountAddress]) : new Set(),
        );
        const mints = holdings.map((h) => h.mint);
        // One batched call each covers the whole portfolio per refresh.
        const [prices, meta] = await Promise.all([fetchPrices(mints), fetchTokenMeta(mints)]);
        if (cancelled) return;

        const priced = holdings.map((h) => {
          const named = meta.get(h.mint);
          const price = prices[h.mint];
          return {
            mint: h.mint,
            symbol: named?.symbol ?? symbolFor(h.mint),
            name: named?.name ?? symbolFor(h.mint),
            icon: named?.icon ?? null,
            decimals: h.decimals,
            amountAtomic: h.amount,
            priceUsd: price?.usd ?? 0,
            change24hPct: price?.change24hPct ?? 0,
            valueMicro: holdingValueMicro(h.amount, h.decimals, price?.usd),
            sourceAccount: h.largestAccount?.address,
            // Internal: what the single biggest account is worth. Only USDC is
            // sized by it, and it never leaves this module under that name.
            largestAccountMicro: h.largestAccount
              ? holdingValueMicro(h.largestAccount.amount, h.decimals, price?.usd)
              : undefined,
          };
        });

        const usdc = priced.find((e) => e.mint === USDC.mint);
        setHolding(usdc ? Number(usdc.amountAtomic) : 0);

        /**
         * USDC is offerable, and it is the only entry sized by ONE ACCOUNT.
         *
         * Keeping part of a dollar balance and spending the rest is the plainest
         * thing a saver does, and refusing it made the wallet's largest holding
         * the one thing that could not be saved. It is not a swap — it is a
         * transfer between two of the user's own accounts — but a single
         * transfer instruction drains a single account, so offering the summed
         * balance would offer money the transaction cannot reach.
         */
        const spendableUsdc =
          usdc?.largestAccountMicro !== undefined
            ? { ...usdc, valueMicro: usdc.largestAccountMicro }
            : undefined;

        // A real wallet returns dozens of accounts, many of them airdropped
        // scams named things like "CLAIM 5000 USDC". Without this filter §11's
        // clean list is unachievable and the demo screenshot is ruined.
        setEntries(
          [...priced.filter((e) => e.mint !== USDC.mint), ...(spendableUsdc ? [spendableUsdc] : [])]
            .filter((e) => e.valueMicro >= MIN_DISPLAY_VALUE_USD * 1_000_000)
            .sort((a, b) => b.valueMicro - a.valueMicro)
            .slice(0, MAX_DISPLAYED_TOKENS),
        );
      } catch (cause) {
        if (!cancelled) {
          setEntries([]);
          setHolding(null);
          setError(cause instanceof Error ? cause.message : 'The wallet read failed.');
          // Left visible: this is the only trace of a read that failed, and
          // swallowing it is what hid a 403 behind an empty-wallet screen.
          console.warn('portfolio read failed:', cause);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `growAccountAddress` is derived locally and lands a tick after mount, so
    // the first read can happen without it. Re-reading when it arrives is what
    // keeps the savings out of the spendable figure rather than only usually.
  }, [publicKey, nonce, growAccountAddress]);

  const value = useMemo<PortfolioState>(
    () => ({ loading, growable: entries, holding, error, refresh }),
    [loading, entries, holding, error, refresh],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioState {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used inside <PortfolioProvider>');
  return ctx;
}
