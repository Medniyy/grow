import { WalletReadyState } from '@solana/wallet-adapter-base';
import {
  WalletProvider as AdapterProvider,
  ConnectionProvider,
  useWallet as useAdapterWallet,
} from '@solana/wallet-adapter-react';
import type { VersionedTransaction } from '@solana/web3.js';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { env } from '../../config/env';
import { type WalletPort, WalletUnsupportedError } from './port';

/**
 * Adapter errors, made readable.
 *
 * `WalletProvider`'s default `onError` only `console.error`s the object. In a
 * dev build that surfaces as the toast `Connection rejected [object Object]`,
 * and in a production build as nothing at all — the connect screen simply sits
 * there having silently failed. The port reported `error: null` unconditionally,
 * so no screen could say otherwise.
 */
const WalletErrorContext = createContext<{
  error: string | null;
  clear: () => void;
}>({ error: null, clear: () => {} });

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  // `WalletError` subclasses carry a name even when the message is empty.
  const name = (error as { name?: string } | null)?.name;
  return name ? `Wallet error (${name}).` : 'The wallet could not be reached.';
}

/**
 * Web implementation of the ADR-001 port.
 *
 * `wallets={[]}` is deliberate and correct: Wallet Standard auto-detection is
 * built into WalletProvider, Phantom and Solflare both implement it, and the
 * individual `@solana/wallet-adapter-wallets` packages are soft-deprecated
 * upstream (they also drag in React 17/18 peers that break installs here).
 *
 * `@solana/wallet-adapter-react-ui` is never used — it renders raw DOM through
 * `createPortal` to `document.body`, which escapes the phone frame entirely.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const clear = useCallback(() => setError(null), []);
  const errorState = useMemo(() => ({ error, clear }), [error, clear]);

  const onError = useCallback((cause: unknown) => {
    setError(messageFor(cause));
  }, []);

  return (
    <ConnectionProvider endpoint={env.rpcUrl}>
      <AdapterProvider wallets={[]} autoConnect onError={onError}>
        <WalletErrorContext.Provider value={errorState}>{children}</WalletErrorContext.Provider>
      </AdapterProvider>
    </ConnectionProvider>
  );
}

export function useWallet(): WalletPort {
  const adapter = useAdapterWallet();
  const { error, clear } = useContext(WalletErrorContext);

  const wallets = useMemo(
    () =>
      adapter.wallets
        .filter((w) => w.readyState === WalletReadyState.Installed)
        .map((w) => ({
          name: w.adapter.name as string,
          icon: w.adapter.icon ?? null,
          installed: true,
        })),
    [adapter.wallets],
  );

  const capabilities = useMemo(
    () => ({
      canSign: typeof adapter.signTransaction === 'function',
      supportsV0: adapter.wallet?.adapter.supportedTransactionVersions?.has(0) ?? false,
    }),
    [adapter.signTransaction, adapter.wallet],
  );

  const select = useCallback(
    (name: string) => {
      // A retry must not start under the last attempt's error message.
      clear();
      adapter.select(name as Parameters<typeof adapter.select>[0]);
    },
    [adapter, clear],
  );

  const signTransaction = useCallback(
    async (tx: VersionedTransaction) => {
      if (typeof adapter.signTransaction !== 'function') {
        throw new WalletUnsupportedError('sign transactions');
      }
      if (!adapter.wallet?.adapter.supportedTransactionVersions?.has(0)) {
        throw new WalletUnsupportedError('sign versioned (v0) transactions');
      }
      return adapter.signTransaction(tx);
    },
    [adapter],
  );

  const status = adapter.connected ? 'connected' : adapter.connecting ? 'connecting' : 'disconnected';

  return {
    status,
    publicKey: adapter.publicKey?.toBase58() ?? null,
    wallets,
    capabilities,
    error,
    select,
    connect: adapter.connect,
    disconnect: adapter.disconnect,
    signTransaction,
  };
}
