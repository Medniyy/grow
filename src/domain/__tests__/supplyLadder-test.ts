import { usdToMicro } from '../money';
import { MIN_SUPPLY_USD, defaultSupplyIndex, supplyRungs } from '../supplyLadder';

describe('supplyRungs', () => {
  it('offers nothing a balance cannot fund', () => {
    expect(supplyRungs(usdToMicro(0))).toEqual([]);
    expect(supplyRungs(usdToMicro(0.5))).toEqual([]);
  });

  it('ends on the whole balance, tagged ALL', () => {
    const rungs = supplyRungs(usdToMicro(25));
    const last = rungs[rungs.length - 1];

    expect(last.micro).toBe(usdToMicro(25));
    expect(last.all).toBe(true);
    // ⚠️ EXACT, not shaved. `rungsFor` trims a few basis points off its ALL rung
    // because a swap's rounding can ask for more of a holding than is held. A
    // supply has no price and nothing to slip, and the fee is paid in SOL from
    // another balance — shaving here would strand cents in the account forever.
    expect(rungs.filter((rung) => rung.all)).toHaveLength(1);
  });

  it('never offers a rung at or above the balance', () => {
    const rungs = supplyRungs(usdToMicro(25));
    const below = rungs.filter((rung) => !rung.all).map((rung) => rung.micro);

    expect(below).toEqual([usdToMicro(1), usdToMicro(5), usdToMicro(10)]);
  });

  it('is not capped by the Grow spend limit', () => {
    // The $25 ceiling is a limit on SPENDING a wallet holding. This money is
    // already saved, and capping it there would tell someone with $400 kept
    // that they may put $25 of it to work and leave the rest idle.
    const rungs = supplyRungs(usdToMicro(400));
    expect(rungs[rungs.length - 1].micro).toBe(usdToMicro(400));
    expect(rungs.some((rung) => rung.micro === usdToMicro(250))).toBe(true);
  });

  it('still offers a balance that is exactly the floor', () => {
    const rungs = supplyRungs(usdToMicro(MIN_SUPPLY_USD));
    expect(rungs).toEqual([{ micro: usdToMicro(MIN_SUPPLY_USD), all: true }]);
  });
});

describe('defaultSupplyIndex', () => {
  it('opens on about half, never on ALL', () => {
    // ⚠️ The default may not be "hand everything to a third-party lending
    // protocol" — not on the same screen as a paragraph about shared losses.
    const rungs = supplyRungs(usdToMicro(25));
    const index = defaultSupplyIndex(rungs);

    expect(rungs[index].micro).toBe(usdToMicro(10));
    expect(rungs[index].all).toBe(false);
  });

  it('scales with the balance instead of picking a fixed figure', () => {
    const big = supplyRungs(usdToMicro(400));
    expect(big[defaultSupplyIndex(big)].micro).toBe(usdToMicro(100));
  });

  it('falls back to the only rung there is', () => {
    const rungs = supplyRungs(usdToMicro(1));
    expect(defaultSupplyIndex(rungs)).toBe(0);
    expect(defaultSupplyIndex([])).toBe(0);
  });
});
