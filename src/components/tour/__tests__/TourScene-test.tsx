import { render } from '@testing-library/react-native';

import { TOUR } from '../../../config/tour';
import { TourScene } from '../TourScene';

/**
 * `active={false}` throughout: every scene is a beat that fires on a timer, and
 * these tests are about the state it STARTS in — the one the caption is read
 * against. Left active, each render would also schedule work that lands after
 * the test has finished.
 *
 * `await render`, and queries off the returned view: in RNTL v14 rendering is
 * async and the module-level `screen` is not populated until it resolves.
 * Money figures are queried by label, because `CountUp` carries its value as an
 * accessibility label while its visible text is mid-count.
 */
describe('TourScene', () => {
  it('draws a scene for every caption in the tour', async () => {
    // The switch is exhaustive by type; this catches a scene that type-checks
    // and then throws — a caption with nothing behind it is a dead frame.
    for (const step of TOUR) {
      const view = await render(<TourScene scene={step.id} active={false} />);
      expect(view.toJSON()).toBeTruthy();
    }
  });

  it('opens the money scene before anything has moved', async () => {
    const view = await render(<TourScene scene="move" active={false} />);

    expect(view.getByText('available')).toBeTruthy();
    expect(view.getByText('kept')).toBeTruthy();
    expect(view.getByLabelText('$20')).toBeTruthy();
    expect(view.getByLabelText('$0')).toBeTruthy();
  });

  it('closes on a scene that starts with the money already kept', async () => {
    // The way out only reads as a way out if there is something to take back.
    const view = await render(<TourScene scene="out" active={false} />);

    expect(view.getByLabelText('$19')).toBeTruthy();
    expect(view.getByLabelText('$1')).toBeTruthy();
  });

  it('shows the payoff as an unlock with the money untouched', async () => {
    const view = await render(<TourScene scene="payoff" active={false} />);

    expect(view.getByText('unlocked')).toBeTruthy();
    // Still kept, still there. This is the whole argument of the scene.
    expect(view.getByLabelText('$1')).toBeTruthy();
  });

  it('offers the real amounts on the real wheel', async () => {
    const view = await render(<TourScene scene="pick" active={false} />);

    expect(view.getByText('Amount')).toBeTruthy();
    expect(view.getByText('$1')).toBeTruthy();
    expect(view.getByText('USD Coin')).toBeTruthy();
  });
});
