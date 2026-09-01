import { fireEvent, render } from '@testing-library/react-native';

import { Wheel } from '../Wheel';

const items = [
  { key: 'a', label: '$0.25' },
  { key: 'b', label: '$0.50' },
  { key: 'c', label: '$0.56', tag: 'ALL' },
];

// `await render`, and queries off the returned view rather than `screen`: in
// RNTL v14 rendering is async, and the module-level `screen` is not populated
// until it resolves.
describe('Wheel', () => {
  it('renders every option, not just the selected one', async () => {
    const view = await render(<Wheel label="Amount" items={items} index={2} onChange={() => {}} />);

    expect(view.getByText('$0.25')).toBeTruthy();
    expect(view.getByText('$0.50')).toBeTruthy();
    expect(view.getByText('ALL')).toBeTruthy();
  });

  it('marks the selected row, so a screen reader tracks the wheel', async () => {
    const view = await render(<Wheel label="Amount" items={items} index={2} onChange={() => {}} />);

    const rows = view.getAllByRole('button');
    expect(rows.map((row) => row.props.accessibilityState?.selected)).toEqual([false, false, true]);
  });

  it('selects a row on press, because scrolling is not the only way in', async () => {
    const onChange = jest.fn();
    const view = await render(<Wheel label="Amount" items={items} index={2} onChange={onChange} />);

    fireEvent.press(view.getByText('$0.50'));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
