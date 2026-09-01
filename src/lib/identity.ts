/**
 * M2 — no screen collects a handle, so it is derived.
 * `@` plus the last four characters of the pubkey. Editable in Settings later.
 */
export function defaultHandle(pubkey: string): string {
  return `@${pubkey.slice(-4).toLowerCase()}`;
}

/** Short display form of an address: `7xKX…9fPq`. */
export function shortAddress(pubkey: string): string {
  return pubkey.length <= 12 ? pubkey : `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`;
}
