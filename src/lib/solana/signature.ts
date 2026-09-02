import type { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * The transaction's id, from the signature the fee payer put on it.
 *
 * ⚠️ AN EMPTY SLOT ENCODES TO A PERFECTLY PLAUSIBLE SIGNATURE. `signatures[0]`
 * is a 64-byte buffer that exists before anybody signs, and base58 of 64 zero
 * bytes is an 88-character string that looks exactly like a real transaction id.
 * Persist that and the row carries an id the chain will never have: the
 * broadcast succeeds, confirmation polls a signature that does not exist, and
 * the app reports a failure while the money moves.
 *
 * Today the user is the fee payer on every path, so slot 0 is always theirs and
 * always filled. That stops being true the moment a SPONSORED transaction is
 * introduced — DFlow's gasless swaps, where the payer is the sponsor. If the
 * sponsor has not pre-signed, slot 0 is still zeros after the user signs. This
 * guard is what turns that from a silent money-shaped bug into an error message.
 */
export function signatureOf(signed: VersionedTransaction): string {
  const first = signed.signatures[0];
  if (!first || first.length === 0 || first.every((byte) => byte === 0)) {
    throw new Error('The wallet returned a transaction that nobody had signed.');
  }
  return bs58.encode(first);
}
