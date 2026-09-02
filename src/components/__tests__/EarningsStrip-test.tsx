import { render } from '@testing-library/react-native';

import { EarningsStrip } from '../EarningsStrip';
import { usdToMicro } from '../../domain/money';

// `await render`: in RNTL v14 rendering is async. Reanimated is stubbed, so the
// travelling light resolves to a settled style and never runs here.
describe('EarningsStrip', () => {
  it('keeps the body and the extra as two separate figures', async () => {
    // §7.1 decision 3. A single summed balance is what makes yield read as a
    // bank statement, and it is also what would make the ladder unverifiable.
    const view = await render(
      <EarningsStrip position={{ supplied: usdToMicro(400), earned: usdToMicro(1.23) }} />,
    );

    expect(view.getByText('$400 at work')).toBeTruthy();
    expect(view.getByText('+$1.23 earned')).toBeTruthy();
    expect(view.queryByText('$401.23 at work')).toBeNull();
  });

  it('shows only the light until there is a cent to name', async () => {
    // ⚠️ The state a real first position lives in for days. `formatUsd` rounds
    // to cents, so naming the figure here would print "+$0.00 earned" — a
    // feature reporting its own pointlessness.
    const view = await render(
      <EarningsStrip position={{ supplied: usdToMicro(25), earned: usdToMicro(0.004) }} />,
    );

    expect(view.getByText('$25 at work')).toBeTruthy();
    expect(view.getByText('earning')).toBeTruthy();
    expect(view.queryByText('+$0.00 earned')).toBeNull();
  });

  it('names the figure the moment it reaches a cent', async () => {
    const view = await render(
      <EarningsStrip position={{ supplied: usdToMicro(25), earned: usdToMicro(0.01) }} />,
    );

    expect(view.getByText('+$0.01 earned')).toBeTruthy();
  });
});
