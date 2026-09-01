import { render } from '@testing-library/react-native';

import { ClosedMoment } from '../ClosedMoment';
import { usdToMicro } from '../../domain/money';

// `await render`, and queries off the returned view rather than `screen`:
// in RNTL v14 rendering is async.
describe('ClosedMoment', () => {
  it('reports the closure as a finish, with what was earned', async () => {
    const view = await render(
      <ClosedMoment
        returnedMicro={usdToMicro(10.07)}
        grownMicro={usdToMicro(10.07)}
        days={2}
        unlockedCount={5}
        seed="wallet"
        onDone={() => {}}
      />,
    );

    expect(view.getByText('$10.07')).toBeTruthy();
    expect(view.getByText('back in your wallet')).toBeTruthy();
    expect(view.getByText('$10.07 grown · 2 days · 5 unlocked')).toBeTruthy();
  });

  it('does not claim milestones nobody earned', async () => {
    // Closing a Grow that only ever held the free seed.
    const view = await render(
      <ClosedMoment
        returnedMicro={usdToMicro(0.4)}
        grownMicro={usdToMicro(0.4)}
        days={1}
        unlockedCount={0}
        seed="wallet"
        onDone={() => {}}
      />,
    );

    expect(view.getByText('$0.40 grown · 1 day')).toBeTruthy();
    expect(view.queryByText(/unlocked/)).toBeNull();
  });

  it('says nothing about days the chain could not answer for', async () => {
    const view = await render(
      <ClosedMoment
        returnedMicro={usdToMicro(3)}
        grownMicro={usdToMicro(3)}
        days={null}
        unlockedCount={2}
        seed="wallet"
        onDone={() => {}}
      />,
    );

    expect(view.getByText('$3 grown · 2 unlocked')).toBeTruthy();
  });
});
