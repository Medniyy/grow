import { HINTS, hintById } from '../hints';
import { MILESTONES } from '../milestones';

/**
 * A hint's rules are copy rules, so nothing else can enforce them.
 *
 * Each of these guards a way the moment-of-need lines degrade back into the
 * thing §2 ruled out: a paragraph shown at the wrong time, or a sentence that
 * quietly stopped being true.
 */
describe('hints', () => {
  it('says two sentences at most', () => {
    for (const hint of HINTS) {
      const terminators = hint.line.match(/[.!?]/g) ?? [];
      expect({ id: hint.id, sentences: terminators.length <= 2 }).toEqual({
        id: hint.id,
        sentences: true,
      });
      expect(terminators.length).toBeGreaterThan(0);
    }
  });

  it('keeps every hint short enough to read in passing', () => {
    for (const hint of HINTS) {
      expect({ id: hint.id, short: hint.line.length <= 96 }).toEqual({ id: hint.id, short: true });
    }
  });

  it('never says "pay"', () => {
    for (const hint of HINTS) {
      expect(hint.line.toLowerCase()).not.toMatch(/\bpay|paying|paid\b/);
    }
  });

  it('never names a milestone', () => {
    // Which rung is unlocked first depends on the ladder and on the size of the
    // Grow. "You could buy a coffee" is wrong the day someone's first Grow is $6.
    for (const hint of HINTS) {
      for (const milestone of MILESTONES) {
        expect({ id: hint.id, names: hint.line.toLowerCase().includes(milestone.label.toLowerCase()) }).toEqual({
          id: hint.id,
          names: false,
        });
      }
    }
  });

  it('has unique ids and can be looked up by them', () => {
    const ids = HINTS.map((hint) => hint.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(hintById(id)?.id).toBe(id);
  });
});
