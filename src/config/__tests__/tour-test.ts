import { MILESTONES } from '../milestones';
import { TOUR, TOUR_MILESTONE_ID, TOUR_SCENE_MS } from '../tour';

/**
 * The tour's rules are copy and pacing rules, so nothing else can enforce them.
 *
 * They are the walkthrough's rules deliberately repeated: this deck exists for
 * the same reason and degrades in the same directions.
 */
describe('tour', () => {
  it('says exactly one sentence per scene', () => {
    for (const step of TOUR) {
      const terminators = step.line.match(/[.!?]/g) ?? [];
      expect({ id: step.id, terminators: terminators.length }).toEqual({
        id: step.id,
        terminators: 1,
      });
      expect(step.line.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('keeps every caption readable in the time it is on screen', () => {
    for (const step of TOUR) {
      expect({ id: step.id, length: step.line.length <= 72 }).toEqual({
        id: step.id,
        length: true,
      });
    }
  });

  it('never says "pay"', () => {
    for (const step of TOUR) {
      expect(step.line.toLowerCase()).not.toMatch(/\bpay|paying|paid\b/);
    }
  });

  it('has unique scene ids', () => {
    const ids = TOUR.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('opens on the choice and closes on the way out', () => {
    // Scene 6 is the honesty beat, and it is what makes the other five
    // believable. Cutting it should have to break a test.
    expect(TOUR[0].id).toBe('pick');
    expect(TOUR[TOUR.length - 1].id).toBe('out');
  });

  it('unlocks a milestone that exists', () => {
    expect(MILESTONES.find((m) => m.id === TOUR_MILESTONE_ID)).toBeDefined();
  });

  it('is over in about twenty seconds', () => {
    // A demo nobody finishes teaches nothing. If a scene is worth more time,
    // the tour is worth fewer scenes.
    expect(TOUR.length * TOUR_SCENE_MS).toBeLessThanOrEqual(20_000);
  });
});
