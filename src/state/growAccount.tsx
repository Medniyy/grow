import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { MicroUsd } from '../domain/money';
import { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

import {
  buildOpenGrowAccountTx,
  buildWithdrawTx,
  growAccountAddress,
  growAccountExists,
} from '../lib/growAccount';
import { fetchAccountOpenedAt } from '../lib/solana/accountAge';
import { fetchTokenAccountBalance } from '../lib/solana/balances';
import { awaitSignature } from '../lib/solana/confirm';
import { connection } from '../lib/solana/connection';
import { useWallet } from '../lib/wallet';

/**
 * The Grow Account: a dedicated USDC token account owned by the user's wallet.
 *
 * `kept` is read from the chain, so it is not a tally the app maintains — it is
 * what the account holds. That is what makes "Vali has $87 growing" something a
 * stranger can verify rather than something Grow asserts.
 *
 * Nothing is remembered between sessions. The address is a pure function of the
 * connected wallet, so a clean browser on a new device finds exactly the same
 * savings with no storage, no secret and no recovery step.
 */
type GrowAccountState = {
  /** Base58. Known as soon as a wallet is connected, created or not. */
  readonly address: string | null;
  /** Whether the account has been opened on chain yet. Null while unknown. */
  readonly exists: boolean | null;
  /** USDC held, in micro-USD. Null while unknown — never silently zero. */
  readonly kept: MicroUsd | null;
  /**
   * Unix ms of the account's first transaction — the day this Grow started.
   *
   * Read from the chain rather than remembered, so the day counter survives a
   * cleared browser. Null until known, and null forever for an account that has
   * not been opened.
   */
  readonly openedAt: number | null;
  readonly loading: boolean;
  readonly error: string | null;
  /** True while a transaction of ours is being signed or confirmed. */
  readonly working: boolean;
  /** One-time: creates the token account on chain. Costs ~0.002 SOL of rent. */
  open(): Promise<boolean>;
  /** Savings, not a prison — money comes back out whenever the user says so. */
  withdraw(amountAtomic: bigint): Promise<boolean>;
  refresh(): void;
};

const GrowAccountContext = createContext<GrowAccountState | null>(null);

export function GrowAccountProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const ownerPubkey = wallet.publicKey;

  const [address, setAddress] = useState<string | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const [kept, setKept] = useState<MicroUsd | null>(null);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Address first: derived, not fetched, so it is known before any network call.
  useEffect(() => {
    let cancelled = false;
    if (!ownerPubkey) {
      setAddress(null);
      setExists(null);
      setKept(null);
      setOpenedAt(null);
      return;
    }
    void (async () => {
      try {
        const derived = await growAccountAddress(ownerPubkey);
        if (!cancelled) setAddress(derived);
      } catch (cause) {
        if (!cancelled) {
          setAddress(null);
          setError(cause instanceof Error ? cause.message : 'Could not derive your Grow account.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerPubkey]);

  // Then existence and balance. USDC has 6 decimals and micro-USD is 1e-6, so
  // the atomic amount IS the micro-dollar amount — no conversion, no drift.
  useEffect(() => {
    let cancelled = false;
    if (!address) return;

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const open = await growAccountExists(address);
        if (cancelled) return;
        setExists(open);

        // An unopened account is zero, not an error — it is where everyone starts.
        // Reads the Grow Account ITSELF; see `fetchTokenAccountBalance` for why
        // asking by owner returns $0 forever and asking by wallet reports the
        // spending balance as savings.
        const atomic = open ? await fetchTokenAccountBalance(address) : 0n;
        if (!cancelled) setKept(Number(atomic));

        // Deliberately AFTER the balance and never allowed to block it: the
        // day counter is a nice number, `kept` is the product. A signature walk
        // is several round trips and must not hold the money figure hostage.
        if (open) {
          const started = await fetchAccountOpenedAt(address);
          if (!cancelled) setOpenedAt(started);
        } else if (!cancelled) {
          setOpenedAt(null);
        }
      } catch (cause) {
        if (!cancelled) {
          // Left null, never zeroed: "could not read" and "is empty" are
          // different facts and the screen must be able to tell them apart.
          setExists(null);
          setKept(null);
          setError(cause instanceof Error ? cause.message : 'Could not read your Grow account.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, nonce]);

  /**
   * Sign, broadcast, wait. Shared by opening and withdrawing because both are
   * ordinary transactions the user's own wallet authorises.
   */
  const run = useCallback(
    async (build: () => Promise<VersionedTransaction>, whatFailed: string) => {
      if (!wallet.publicKey) throw new Error('Connect a wallet first.');
      setWorking(true);
      setError(null);
      try {
        const signed = await wallet.signTransaction(await build());
        const signature = bs58.encode(signed.signatures[0]);
        const rpc = connection();
        const { lastValidBlockHeight } = await rpc.getLatestBlockhash();
        await rpc.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });

        // Polled, never `confirmTransaction` — that one subscribes over a
        // websocket the HTTP proxy does not serve, and hangs forever on a
        // transaction that already succeeded.
        const outcome = await awaitSignature(signature, lastValidBlockHeight);
        if (outcome.status !== 'confirmed') {
          throw new Error(
            outcome.status === 'expired'
              ? 'That expired before it landed. Nothing was spent.'
              : `It did not go through (${outcome.reason}).`,
          );
        }
        refresh();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : whatFailed);
        return false;
      } finally {
        setWorking(false);
      }
    },
    [wallet, refresh],
  );

  const open = useCallback(
    () => run(() => buildOpenGrowAccountTx(wallet.publicKey as string), 'Could not open your Grow.'),
    [run, wallet.publicKey],
  );

  const withdraw = useCallback(
    (amountAtomic: bigint) =>
      run(
        () => buildWithdrawTx(wallet.publicKey as string, amountAtomic),
        'Could not take that out.',
      ),
    [run, wallet.publicKey],
  );

  const value = useMemo<GrowAccountState>(
    () => ({ address, exists, kept, openedAt, loading, error, working, open, withdraw, refresh }),
    [address, exists, kept, openedAt, loading, error, working, open, withdraw, refresh],
  );

  return <GrowAccountContext.Provider value={value}>{children}</GrowAccountContext.Provider>;
}

export function useGrowAccount(): GrowAccountState {
  const ctx = useContext(GrowAccountContext);
  if (!ctx) throw new Error('useGrowAccount must be used inside <GrowAccountProvider>');
  return ctx;
}
