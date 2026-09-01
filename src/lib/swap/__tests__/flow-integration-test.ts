import { type GrowAction, transition } from '../../../domain/growAction';
import { grownMicro, unreconciledActions, upsertAction } from '../../../domain/ledger';
import { usdToMicro } from '../../../domain/money';
import { computeProgress, newUnlockIds } from '../../../domain/progress';
import { mockSwapPort } from '../mock';

/**
 * The money-path SEQUENCE, exercised without a network or a wallet.
 *
 * This is the rehearsal Q14 asks for: the demo runs on mainnet with real funds,
 * so the ordering that protects the ledger has to be provable somewhere that
 * costs nothing. It mirrors exactly what `useGrowFlow.execute` does.
 */
const OWNER = 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp';
const SOL = 'So11111111111111111111111111111111111111112';

async function buildRow(amountAtomic: string): Promise<GrowAction> {
  const order = await mockSwapPort.buildOrder({
    inputMint: SOL,
    inputAmountAtomic: amountAtomic,
    userPublicKey: OWNER,
  });

  return {
    id: `row-${amountAtomic}`,
    status: 'quoted',
    inputMint: SOL,
    inputAmountAtomic: amountAtomic,
    quotedOutMicro: order.outMicro,
    minOutMicro: order.minOutMicro,
    signature: null,
    lastValidBlockHeight: order.lastValidBlockHeight,
    usdcReceivedMicro: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('a Grow, end to end', () => {
  it('walks quote -> sign -> persist -> broadcast -> confirm and lands in the ledger', async () => {
    let ledger: readonly GrowAction[] = [];
    let unlocked: readonly string[] = ['started'];

    const row = await buildRow('1000000'); // ~$1

    // Persisted the moment a signature exists, BEFORE the network sees it (Q3).
    const submitted = transition(row, 'submitted', { signature: 'sig-1' });
    ledger = upsertAction(ledger, submitted);
    expect(grownMicro(ledger)).toBe(0); // nothing counts until confirmation

    const pending = transition(submitted, 'pending');
    ledger = upsertAction(ledger, pending);

    // Q5: the figure comes off the transaction, not the quote.
    const confirmed = transition(pending, 'confirmed', { usdcReceivedMicro: 998_000 });
    ledger = upsertAction(ledger, confirmed);

    const fresh = newUnlockIds(grownMicro(ledger), unlocked);
    unlocked = [...unlocked, ...fresh];

    expect(ledger).toHaveLength(1);
    expect(grownMicro(ledger)).toBe(998_000);
    expect(fresh).toEqual([]); // $0.998 does not reach Coffee at $1 — no false promise
    expect(computeProgress(grownMicro(ledger), unlocked).next?.id).toBe('coffee');
  });

  it('never promises an unlock the guaranteed floor cannot deliver', async () => {
    const order = await mockSwapPort.buildOrder({
      inputMint: SOL,
      inputAmountAtomic: '1000000',
      userPublicKey: OWNER,
    });
    // The mock models the one thing that matters: the floor is below the hope.
    expect(order.minOutMicro).toBeLessThan(order.outMicro);
    expect(order.minOutMicro + usdToMicro(0)).toBeLessThan(usdToMicro(1));
  });

  it('survives the app dying between signing and confirmation', async () => {
    // Session one: signed, persisted, then the process is killed.
    const row = await buildRow('2000000');
    let ledger = upsertAction([], transition(row, 'submitted', { signature: 'sig-2' }));

    expect(grownMicro(ledger)).toBe(0);

    // Session two: cold start finds the open row and chases it down.
    const open = unreconciledActions(ledger);
    expect(open).toHaveLength(1);
    expect(open[0].signature).toBe('sig-2');

    // The chain says it landed. Without the pre-broadcast write this USDC would
    // sit in the wallet and never reach the ledger.
    ledger = upsertAction(ledger, transition(open[0], 'confirmed', { usdcReceivedMicro: 1_996_000 }));

    expect(unreconciledActions(ledger)).toHaveLength(0);
    expect(grownMicro(ledger)).toBe(1_996_000);
  });

  it('counts two real Grows once each, even when confirmations are replayed', async () => {
    let ledger: readonly GrowAction[] = [];

    for (const [id, sig, amount] of [
      ['a', 'sig-a', 1_000_000],
      ['b', 'sig-b', 1_500_000],
    ] as const) {
      const base = await buildRow(String(amount));
      const confirmed = transition(
        transition({ ...base, id }, 'submitted', { signature: sig }),
        'confirmed',
        { usdcReceivedMicro: amount },
      );
      ledger = upsertAction(ledger, confirmed);
      ledger = upsertAction(ledger, confirmed); // replay
      ledger = upsertAction(ledger, confirmed); // and again
    }

    expect(ledger).toHaveLength(2);
    expect(grownMicro(ledger)).toBe(2_500_000);

    const unlocked = newUnlockIds(grownMicro(ledger), ['started']);
    expect(unlocked).toEqual(['coffee', 'cola']);
    // Replaying the whole reconciliation pass must not re-fire the celebration.
    expect(newUnlockIds(grownMicro(ledger), ['started', ...unlocked])).toEqual([]);
  });
});
