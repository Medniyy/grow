import type { VersionedTransaction } from '@solana/web3.js';

/**
 * ADR-001 — the one interface every screen sees.
 *
 * Grow ships NO bespoke wallet, no keypair generator, no seed-phrase flow and no
 * embedded custodial wallet. Users bring a wallet they already own, and it stays
 * the only key in the system: the Grow Account is a second TOKEN ACCOUNT whose
 * authority is this same wallet, not a second keypair.
 *
 * No screen may import `@solana/wallet-adapter-react` directly. Wallet-adapter is
 * a browser library; a native build swaps in Mobile Wallet Adapter behind this
 * same interface and nothing above the port changes.
 */

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export type DetectedWallet = {
  readonly name: string;
  readonly icon: string | null;
  /** Only wallets actually present are offered — no dead buttons. */
  readonly installed: boolean;
};

/**
 * Both are optional on the adapter interface and must be checked before every
 * swap. DFlow returns a v0 VersionedTransaction, so a wallet that cannot sign
 * version 0 cannot Grow, and we need to say so before taking the user's money.
 */
export type WalletCapabilities = {
  readonly canSign: boolean;
  readonly supportsV0: boolean;
};

export type WalletPort = {
  readonly status: WalletStatus;
  /** Base58. Q6: this IS the account identity. */
  readonly publicKey: string | null;
  readonly wallets: readonly DetectedWallet[];
  readonly capabilities: WalletCapabilities;
  readonly error: string | null;

  select(name: string): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Signs only. We broadcast ourselves — DFlow already set blockhash, compute
   *  budget and priority fee, so `sendTransaction` would overwrite them. */
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
};

export class WalletUnsupportedError extends Error {
  constructor(what: string) {
    super(`This wallet cannot ${what}. Try Phantom or Solflare.`);
    this.name = 'WalletUnsupportedError';
  }
}
