import { daysGrowing, formatDays, growStartedAt } from '../days';

/** Local midnight on a given calendar day, so the tests are timezone-proof. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('daysGrowing', () => {
  it('calls the opening day day one', () => {
    expect(daysGrowing(at(2026, 8, 30, 9), at(2026, 8, 30, 23))).toBe(1);
  });

  it('counts calendar days, not 24-hour blocks', () => {
    // Forty minutes after midnight is "yesterday I started" to a person, and
    // the counter has to agree with how people speak or it reads as broken.
    expect(daysGrowing(at(2026, 8, 30, 23), at(2026, 8, 31, 0))).toBe(2);
  });

  it('counts a long run', () => {
    expect(daysGrowing(at(2026, 8, 1), at(2026, 8, 31))).toBe(31);
  });

  it('survives a clock behind the chain rather than reporting day zero', () => {
    expect(daysGrowing(at(2026, 8, 31), at(2026, 8, 30))).toBe(1);
  });

  it('says nothing at all when the opening date is unknown', () => {
    // An unopened account or an unanswered chain read. A placeholder here is
    // how a demo publishes a day count nobody earned.
    expect(daysGrowing(null, at(2026, 8, 31))).toBeNull();
    expect(daysGrowing(Number.NaN, at(2026, 8, 31))).toBeNull();
  });
});

describe('formatDays', () => {
  it('gets the singular right', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(2)).toBe('2 days');
  });
});

describe('growStartedAt', () => {
  const confirmed = (ms: number) =>
    ({ status: 'confirmed', createdAt: ms }) as unknown as Parameters<typeof growStartedAt>[0][0];
  const pending = (ms: number) =>
    ({ status: 'pending', createdAt: ms }) as unknown as Parameters<typeof growStartedAt>[0][0];

  const OPENED = at(2026, 8, 20);

  it('starts at the first real Grow, not when the account was opened', () => {
    // ⚠️ The account's first transaction is fixed on chain forever, so counting
    // from it kept the clock running through a closure and told someone who
    // had just started over that they were on day five.
    const started = growStartedAt([confirmed(at(2026, 8, 30)), confirmed(at(2026, 9, 1))], OPENED);
    expect(started).toBe(at(2026, 8, 30));
  });

  it('counts a Grow started after a closure from day one', () => {
    // Closing clears the ledger, so the next deposit IS the start.
    const started = growStartedAt([confirmed(at(2026, 9, 1, 9))], OPENED);
    expect(daysGrowing(started, at(2026, 9, 1, 22))).toBe(1);
  });

  it('ignores rows that never settled', () => {
    const started = growStartedAt([pending(at(2026, 8, 25)), confirmed(at(2026, 8, 30))], OPENED);
    expect(started).toBe(at(2026, 8, 30));
  });

  it('falls back to the account age when the ledger is empty', () => {
    // Nothing grown yet, or storage was cleared while the money stayed on
    // chain. Over-reporting beats telling a two-week saver they started today.
    expect(growStartedAt([], OPENED)).toBe(OPENED);
    expect(growStartedAt([], null)).toBeNull();
  });
});
