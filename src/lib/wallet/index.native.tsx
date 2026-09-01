import type { ReactNode } from 'react';

import type { WalletPort } from './port';

/**
 * Native implementation — ADR-001 keeps this path open behind the same
 * interface. Wallet-adapter cannot run here: it discovers wallets through the
 * Wallet Standard on `window`, which a native runtime has no equivalent of.
 *
 * Filling this in means Mobile Wallet Adapter on Android and a deeplink flow on
 * iOS. Scoped, not blocking — the MVP demo target is Expo Web at a phone
 * viewport, which is a real browser and also runs inside a wallet's in-app
 * browser on a real phone.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useWallet(): WalletPort {
  const unavailable = async () => {
    throw new Error('Native wallet support is not implemented yet — run Grow on web.');
  };

  return {
    status: 'disconnected',
    publicKey: null,
    wallets: [],
    capabilities: { canSign: false, supportsV0: false },
    error: 'Native wallet support is not implemented yet.',
    select: () => {},
    connect: unavailable,
    disconnect: unavailable,
    signTransaction: unavailable,
  };
}
