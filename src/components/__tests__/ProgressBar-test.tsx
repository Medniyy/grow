import { render } from '@testing-library/react-native';

import { ProgressBar } from '../ProgressBar';
import { color } from '../../theme/tokens';

type Node = { props?: { style?: unknown }; children?: Node[] | null };

/**
 * The two fill layers, in render order: ghost first, then the solid fill.
 *
 * Read off the rendered output rather than by query, the way `CountUp` is
 * tested — the bar has no text and no role, it is two coloured boxes.
 */
function layers(tree: Node | null) {
  const found: { color: unknown; width: unknown }[] = [];
  const walk = (node: Node | null) => {
    if (!node || typeof node !== 'object') return;
    const merged = Object.assign({}, ...[node.props?.style].flat(4).filter(Boolean)) as Record<
      string,
      unknown
    >;
    if (merged.backgroundColor === color.growth || merged.backgroundColor === color.growthGhost) {
      found.push({ color: merged.backgroundColor, width: merged.width });
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return found;
}

// `await render`: in RNTL v14 rendering is async. Reanimated is stubbed, so
// animated styles resolve to their settled values.
describe('ProgressBar', () => {
  const bar = async (props: { percent: number; preview?: number }) =>
    layers((await render(<ProgressBar {...props} />)).toJSON() as Node | null);

  it('draws the ghost ahead of the real fill', async () => {
    const [ghost, fill] = await bar({ percent: 0.5, preview: 0.8 });

    expect(ghost.color).toBe(color.growthGhost);
    expect(ghost.width).toBe('80%');
    expect(fill.color).toBe(color.growth);
    expect(fill.width).toBe('50%');
  });

  it('stops the ghost at the end of the bar', async () => {
    // An amount larger than the whole rung fills it and stops, rather than
    // overflowing into a claim the bar cannot make.
    const [ghost] = await bar({ percent: 0.5, preview: 4 });
    expect(ghost.width).toBe('100%');
  });

  it('never draws a ghost behind the real fill', async () => {
    // A preview smaller than what is already earned would read as the bar
    // about to travel backwards — the thing this component must never do.
    const [ghost, fill] = await bar({ percent: 0.7, preview: 0.2 });
    expect(ghost.width).toBe('70%');
    expect(fill.width).toBe('70%');
  });

  it('shows nothing extra when no amount is selected', async () => {
    const [ghost, fill] = await bar({ percent: 0.4 });
    expect(ghost.width).toBe('40%');
    expect(fill.width).toBe('40%');
  });
});
