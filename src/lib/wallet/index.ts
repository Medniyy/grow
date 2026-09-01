/**
 * Type-resolution entry only.
 *
 * Metro always shadows this with `index.web.tsx` (web) or `index.native.tsx`
 * (native) via platform-extension resolution, so this file is never bundled.
 * It exists so TypeScript can resolve `../lib/wallet` to a single stable shape.
 */
export * from './port';
export { WalletProvider, useWallet } from './index.web';
