import { grownMicro } from '../../domain/ledger';
import { formatUsd, usdToMicro } from '../../domain/money';
import { computeProgress } from '../../domain/progress';
import { DEMO_ACTIONS, isDemoAction } from '../demo';

describe('Demo Mode seed (Q14)', () => {
  it('lands exactly on the demo script: iPhone at 94%, $72 to go', () => {
    const grown = grownMicro(DEMO_ACTIONS);
    const progress = computeProgress(grown, ['started']);

    expect(grown).toBe(usdToMicro(1127.06));
    expect(progress.next?.id).toBe('iphone');
    expect(Math.round(progress.percentToNext * 100)).toBe(94);
    expect(formatUsd(progress.remaining)).toBe('$71.94');
  });

  it('marks every seeded row so it can never pass as real', () => {
    expect(DEMO_ACTIONS.every(isDemoAction)).toBe(true);
    expect(isDemoAction({ ...DEMO_ACTIONS[0], signature: 'realSignature' })).toBe(false);
  });

  it('carries an on-chain figure on every row, so the ledger stays consistent', () => {
    // A confirmed row with a null amount is an integrity bug; seeded data must
    // not introduce one just because it is fake.
    expect(
      DEMO_ACTIONS.every((a) => a.status === 'confirmed' && a.usdcReceivedMicro !== null),
    ).toBe(true);
  });
});
