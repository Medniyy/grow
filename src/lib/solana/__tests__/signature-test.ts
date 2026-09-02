import type { VersionedTransaction } from '@solana/web3.js';

import { signatureOf } from '../signature';

const tx = (...slots: Uint8Array[]) => ({ signatures: slots }) as unknown as VersionedTransaction;

const filled = () => Uint8Array.from({ length: 64 }, (_, i) => (i % 255) + 1);
const empty = () => new Uint8Array(64);

describe('signatureOf', () => {
  it('returns the fee payer’s signature as the transaction id', () => {
    expect(signatureOf(tx(filled()))).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it('refuses an unsigned slot instead of encoding it', () => {
    // ⚠️ THE WHOLE POINT. Base58 of 64 zero bytes is an 88-character string that
    // looks exactly like a real signature. Persisting it gives the row an id the
    // chain will never have: the broadcast succeeds, confirmation polls a
    // signature that does not exist, and the app reports a failure while the
    // money moves. Reachable the moment a SPONSORED transaction is introduced,
    // where slot 0 belongs to the sponsor rather than the user.
    expect(() => signatureOf(tx(empty()))).toThrow(/nobody had signed/);
    expect(() => signatureOf(tx(empty(), filled()))).toThrow(/nobody had signed/);
  });

  it('refuses a transaction with no signature slots at all', () => {
    expect(() => signatureOf(tx())).toThrow(/nobody had signed/);
  });
});
