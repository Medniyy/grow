import { WALKTHROUGH, WALKTHROUGH_LADDER } from '../walkthrough';
import { MILESTONES } from '../milestones';

/**
 * The walkthrough's rules are copy rules, so nothing else can enforce them.
 *
 * Each of these caught a way the deck degrades back into the thing it replaced:
 * a wall of explanation nobody reads, or a picture that no longer matches the
 * product.
 */
describe('walkthrough', () => {
  it('says exactly one sentence per slide', () => {
    for (const slide of WALKTHROUGH) {
      // Terminal punctuation is allowed once, at the end. An em dash and a
      // comma are fine — a second full stop means a second sentence, and a
      // second sentence is a slide that should have been two.
      const terminators = slide.line.match(/[.!?]/g) ?? [];
      expect({ id: slide.id, terminators: terminators.length }).toEqual({
        id: slide.id,
        terminators: 1,
      });
      expect(slide.line.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('keeps every sentence short enough to read at a glance', () => {
    for (const slide of WALKTHROUGH) {
      expect({ id: slide.id, length: slide.line.length <= 72 }).toEqual({
        id: slide.id,
        length: true,
      });
    }
  });

  it('never says "pay"', () => {
    // The idea is "a part of all you earn is yours to keep". Every attempt to
    // say it as `pay yourself first` gets read as paying somebody, which is the
    // exact misunderstanding this deck exists to prevent.
    for (const slide of WALKTHROUGH) {
      expect(slide.line.toLowerCase()).not.toMatch(/\bpay|paying|paid\b/);
    }
  });

  it('has unique slide ids', () => {
    const ids = WALKTHROUGH.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws every ladder rung it names', () => {
    // Joined on milestone id, like everything else. Renaming a milestone must
    // never leave the walkthrough pointing at artwork that no longer exists.
    for (const id of WALKTHROUGH_LADDER) {
      expect(MILESTONES.find((m) => m.id === id)).toBeDefined();
    }
  });

  it('opens on the rule and closes on the payoff', () => {
    // The order IS the argument. Reordering the deck should have to be a
    // deliberate act that breaks a test, not a quiet edit to a list.
    expect(WALKTHROUGH[0].id).toBe('outflow');
    expect(WALKTHROUGH[WALKTHROUGH.length - 1].id).toBe('payoff');
  });
});
