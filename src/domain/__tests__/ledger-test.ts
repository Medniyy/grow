import {
  grownMicro,
  recoveredMicro,
  integrityIssues,
  unreconciledActions,
  upsertAction,
} from '../ledger';
import { usdToMicro } from '../money';
import { makeAction } from './growAction-test';

const confirmed = (id: string, sig: string, usd: number) =>
  makeAction({ id, signature: sig, status: 'confirmed', usdcReceivedMicro: usdToMicro(usd) });

describe('grown', () => {
  it('counts only confirmed actions', () => {
    const actions = [
      confirmed('a', 'sig-a', 1),
      makeAction({ id: 'b', status: 'pending', quotedOutMicro: usdToMicro(50) }),
      makeAction({ id: 'c', status: 'failed', quotedOutMicro: usdToMicro(50) }),
      confirmed('d', 'sig-d', 2),
    ];
    expect(grownMicro(actions)).toBe(usdToMicro(3));
  });

  it('starts at zero regardless of anything else (Q1)', () => {
    expect(grownMicro([])).toBe(0);
  });

  it('never substitutes the quote for the on-chain figure (Q5)', () => {
    const broken = makeAction({ status: 'confirmed', quotedOutMicro: usdToMicro(999) });
    expect(grownMicro([broken])).toBe(0);
    expect(integrityIssues([broken])).toHaveLength(1);
  });
});

describe('recovering a wiped ledger from the chain', () => {
  const ledgerOf = (...usd: number[]) =>
    grownMicro(usd.map((n, i) => confirmed(String(i), `sig-${i}`, n)));

  // Clearing site data wiped the ledger while the Grow Account kept the money,
  // and the screen showed `$0 grown` directly above `$1.57 kept`.
  it('recovers what the ledger lost', () => {
    expect(recoveredMicro(0, usdToMicro(1.57))).toBe(usdToMicro(1.57));
  });

  it('recovers nothing from a ledger that already agrees', () => {
    expect(recoveredMicro(ledgerOf(3, 2), usdToMicro(5))).toBe(0);
  });

  it('recovers nothing after a withdrawal, so grown cannot fall (Q1)', () => {
    // Grew $5, took $3 back out: still grew $5, now keeps $2.
    expect(ledgerOf(5) + recoveredMicro(ledgerOf(5), usdToMicro(2))).toBe(usdToMicro(5));
  });

  it('treats an unknown balance as unknown, never as zero', () => {
    expect(recoveredMicro(ledgerOf(4), null)).toBe(0);
    expect(recoveredMicro(0, null)).toBe(0);
  });

  it('still starts everyone at zero (Q1)', () => {
    // An unopened Grow Account is $0, and holding $671 of other tokens is not
    // growth — `kept` is the only balance allowed anywhere near this number.
    expect(recoveredMicro(0, 0)).toBe(0);
  });

  it('ADDS to later Grows instead of swallowing them', () => {
    // The regression this replaced: a live `max(ledger, kept)` read $1.57 both
    // before and after a $0.44 Grow, so the delta was zero and the whole
    // celebration was skipped. Pinned once, the sum moves by exactly the Grow.
    const pinned = recoveredMicro(0, usdToMicro(1.57));
    const before = 0 + pinned;
    const after = ledgerOf(0.44) + pinned;

    expect(before).toBe(usdToMicro(1.57));
    expect(after).toBe(usdToMicro(2.01));
    expect(after - before).toBe(usdToMicro(0.44));
  });
});

describe('upsert idempotency (Q4)', () => {
  it('does not count a replayed signature twice', () => {
    let actions = upsertAction([], confirmed('a', 'sig-a', 1));
    actions = upsertAction(actions, confirmed('a', 'sig-a', 1));
    actions = upsertAction(actions, confirmed('a', 'sig-a', 1));
    expect(actions).toHaveLength(1);
    expect(grownMicro(actions)).toBe(usdToMicro(1));
  });

  it('matches on signature even when the local id differs', () => {
    // The same broadcast reaching us twice — once from our own submit, once
    // from cold-start reconciliation, which had to mint a fresh local id.
    let actions = upsertAction([], confirmed('local-1', 'sig-x', 5));
    actions = upsertAction(actions, confirmed('local-2', 'sig-x', 5));
    expect(actions).toHaveLength(1);
    expect(grownMicro(actions)).toBe(usdToMicro(5));
  });

  it('upgrades a quoted row in place once it has a signature', () => {
    const quoted = makeAction({ id: 'a' });
    let actions = upsertAction([], quoted);
    actions = upsertAction(actions, { ...quoted, status: 'submitted', signature: 'sig-a' });
    expect(actions).toHaveLength(1);
    expect(actions[0].signature).toBe('sig-a');
  });

  it('keeps genuinely distinct Grows apart', () => {
    let actions = upsertAction([], confirmed('a', 'sig-a', 1));
    actions = upsertAction(actions, confirmed('b', 'sig-b', 1));
    expect(actions).toHaveLength(2);
    expect(grownMicro(actions)).toBe(usdToMicro(2));
  });
});

describe('cold-start reconciliation (Q3)', () => {
  it('surfaces every non-terminal row', () => {
    const actions = [
      confirmed('a', 'sig-a', 1),
      makeAction({ id: 'b', status: 'submitted' }),
      makeAction({ id: 'c', status: 'pending' }),
      makeAction({ id: 'd', status: 'expired' }),
    ];
    expect(unreconciledActions(actions).map((a) => a.id)).toEqual(['b', 'c']);
  });
});
