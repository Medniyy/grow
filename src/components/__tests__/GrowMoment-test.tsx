import { render } from '@testing-library/react-native';

import { GrowMoment } from '../GrowMoment';
import { usdToMicro } from '../../domain/money';

const MEAL = { id: 'meal', label: 'Meal', thresholdUsd: 5 };

// `await render`, and queries off the returned view rather than `screen`:
// in RNTL v14 rendering is async.
describe('GrowMoment', () => {
  it('makes the money the event when no milestone was crossed', async () => {
    const view = await render(
      <GrowMoment addedMicro={usdToMicro(0.44)} grownMicro={usdToMicro(2.01)} next={MEAL} />,
    );

    expect(view.getByText('+$0.44')).toBeTruthy();
    expect(view.getByText('$2.99 to Meal')).toBeTruthy();
    expect(view.getByText('$2.01 of $5')).toBeTruthy();
  });

  it('prefers the warmer line when a percent mark was crossed', async () => {
    const view = await render(
      <GrowMoment
        addedMicro={usdToMicro(1)}
        grownMicro={usdToMicro(2.6)}
        next={MEAL}
        mark={50}
      />,
    );

    expect(view.getByText('50% of the way to Meal')).toBeTruthy();
    expect(view.queryByText('$2.40 to Meal')).toBeNull();
  });

  it('says something rather than nothing at the top of the ladder', async () => {
    const view = await render(
      <GrowMoment addedMicro={usdToMicro(5)} grownMicro={usdToMicro(10000)} next={null} />,
    );

    expect(view.getByText('+$5')).toBeTruthy();
    expect(view.getByText(/ladder is complete/)).toBeTruthy();
  });
});
