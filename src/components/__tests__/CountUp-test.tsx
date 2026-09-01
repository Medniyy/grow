import { render } from '@testing-library/react-native';

import { usdToMicro } from '../../domain/money';
import { CountUp } from '../CountUp';

describe('CountUp', () => {
  it('paints the real figure immediately rather than starting from zero', async () => {
    const view = await render(<CountUp value={usdToMicro(4.21)} />);
    const tree = view.toJSON() as { children?: unknown[]; props?: Record<string, unknown> };

    // Queried off the rendered output rather than getByText, because the
    // component carries an accessibilityLabel (so a screen reader announces the
    // settled figure instead of every intermediate number), and that label
    // shadows the visible text for RNTL's text queries.
    expect(tree.children).toEqual(['$4.21']);
    expect(tree.props?.accessibilityLabel).toBe('$4.21');
  });
});
