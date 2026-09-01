import { type GrowAction, canTransition, isTerminal, transition } from '../growAction';
import { usdToMicro } from '../money';

export function makeAction(patch: Partial<GrowAction> = {}): GrowAction {
  return {
    id: 'a1',
    status: 'quoted',
    inputMint: 'So11111111111111111111111111111111111111112',
    inputAmountAtomic: '1000000',
    quotedOutMicro: usdToMicro(1),
    minOutMicro: usdToMicro(0.98),
    signature: null,
    lastValidBlockHeight: null,
    usdcReceivedMicro: null,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe('status lifecycle', () => {
  it('walks the happy path', () => {
    const quoted = makeAction();
    const submitted = transition(quoted, 'submitted', { signature: 'sig', lastValidBlockHeight: 10 });
    const pending = transition(submitted, 'pending');
    const confirmed = transition(pending, 'confirmed', { usdcReceivedMicro: usdToMicro(0.99) });
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.usdcReceivedMicro).toBe(990_000);
  });

  it('allows a fast confirmation that skips pending', () => {
    expect(canTransition('submitted', 'confirmed')).toBe(true);
  });

  it('refuses to move out of a terminal state', () => {
    const confirmed = makeAction({ status: 'confirmed', usdcReceivedMicro: 1 });
    expect(isTerminal(confirmed.status)).toBe(true);
    expect(() => transition(confirmed, 'pending')).toThrow(/illegal transition/);
    expect(() => transition(makeAction({ status: 'failed' }), 'confirmed')).toThrow();
  });

  it('refuses to go backwards', () => {
    expect(() => transition(makeAction({ status: 'pending' }), 'submitted')).toThrow();
  });

  it('refuses to confirm without an on-chain figure (Q5)', () => {
    const pending = makeAction({ status: 'pending' });
    expect(() => transition(pending, 'confirmed')).toThrow(/usdcReceivedMicro/);
    // The quote is not an acceptable substitute — it must be passed explicitly.
    expect(transition(pending, 'confirmed', { usdcReceivedMicro: 1 }).status).toBe('confirmed');
  });
});
