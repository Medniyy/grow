import { render } from '@testing-library/react-native';

import { MILESTONES } from '../../config/milestones';
import { MilestoneMark } from '../MilestoneMark';

// `await render`, and queries off the returned view rather than `screen`:
// in RNTL v14 rendering is async.
describe('MilestoneMark', () => {
  it('has artwork for every rung of the ladder', async () => {
    // Joins on `id`, so a renamed label cannot silently lose a picture — but a
    // NEW milestone can, and that is what this catches.
    for (const milestone of MILESTONES) {
      const view = await render(
        <MilestoneMark id={milestone.id} label={milestone.label} unlocked />,
      );
      expect(view.getByLabelText(milestone.label)).toBeTruthy();
    }
  });

  it('shows a locked rung as the same object, faded', async () => {
    // You are meant to be looking at the thing you have not got yet.
    const view = await render(<MilestoneMark id="iphone" label="iPhone" unlocked={false} />);
    const art = view.getByLabelText('iPhone');
    expect(art.props.style.flat().some((s: { opacity?: number }) => s?.opacity === 0.3)).toBe(true);
  });

  it('still renders a milestone that has no artwork yet', async () => {
    // A crash on the Collection screen is worse than two ugly letters.
    const view = await render(<MilestoneMark id="not-drawn-yet" label="Yacht" />);
    expect(view.getByText('YA')).toBeTruthy();
  });
});
