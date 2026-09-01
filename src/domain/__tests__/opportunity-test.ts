import type { Milestone } from '../../config/milestones';
import { USDC } from '../../config/tokens';
import { usdToMicro } from '../money';
import {
  dailyDeltaMicro,
  dailyMovement,
  type OpportunityHolding,
  pickOpportunity,
} from '../opportunity';

const dinner: Milestone = { id: 'dinner', label: 'Dinner', thresholdUsd: 25 } as Milestone;

const holding = (over: Partial<OpportunityHolding> = {}): OpportunityHolding => ({
  mint: 'SOLmint',
  name: 'Solana',
  valueMicro: usdToMicro(100),
  change24hPct: 0,
  ...over,
});

describe('dailyDeltaMicro', () => {
  it('backs the move out of the current value rather than multiplying by it', () => {
    // $110 that rose 10% was $100 yesterday, so the gain is $10 — NOT $11,
    // which is what `value * pct` would wrongly produce.
    const delta = dailyDeltaMicro(holding({ valueMicro: usdToMicro(110), change24hPct: 10 }));
    expect(delta).toBe(usdToMicro(10));
  });

  it('is negative on a fall, and symmetric in the same way', () => {
    // $90 after a 10% fall was $100, so the loss is $10. Negated OUTSIDE
    // `usdToMicro`, which refuses negative amounts by design.
    const delta = dailyDeltaMicro(holding({ valueMicro: usdToMicro(90), change24hPct: -10 }));
    expect(delta).toBe(-usdToMicro(10));
  });

  it('reads the percent scale, not a fraction', () => {
    // USDC reports -0.0138, which is -0.0138% — a stablecoin holding its peg.
    // Read as a fraction it would be -1.38%, a depeg, and would drag the whole
    // portfolio delta negative and flip the engine to `steady` on a green day.
    const delta = dailyDeltaMicro(holding({ valueMicro: usdToMicro(1000), change24hPct: -0.0138 }));
    expect(Math.abs(delta)).toBeLessThan(usdToMicro(0.2));
  });

  it('never returns a non-finite number for a -100% wipeout', () => {
    const delta = dailyDeltaMicro(holding({ change24hPct: -100 }));
    expect(Number.isFinite(delta)).toBe(true);
  });
});

describe('dailyMovement', () => {
  it('sums the portfolio and names the biggest riser', () => {
    const { totalMicro, leader } = dailyMovement([
      holding({ mint: 'A', valueMicro: usdToMicro(110), change24hPct: 10 }),
      holding({ mint: 'B', valueMicro: usdToMicro(105), change24hPct: 5 }),
      holding({ mint: 'C', valueMicro: usdToMicro(90), change24hPct: -10 }),
    ]);
    // +$10 +$5 -$10
    expect(totalMicro).toBe(usdToMicro(5));
    expect(leader?.mint).toBe('A');
  });

  it('has no leader when nothing rose', () => {
    const { leader } = dailyMovement([holding({ valueMicro: usdToMicro(90), change24hPct: -10 })]);
    expect(leader).toBeNull();
  });
});

describe('pickOpportunity ranks by what the user can act on', () => {
  it('puts a finishable milestone above a market gain', () => {
    const pick = pickOpportunity({
      grown: usdToMicro(23),
      next: dinner,
      remaining: usdToMicro(2),
      holdings: [holding({ valueMicro: usdToMicro(200), change24hPct: 50 })],
    });
    expect(pick.kind).toBe('milestone');
    expect(pick.body).toContain('Dinner');
    // Padded past the gap, so the guaranteed floor clears it — Q2.
    expect(pick.amounts[0]).toBeGreaterThan(usdToMicro(2));
  });

  it('reports a gain, and never offers more than actually appeared', () => {
    const pick = pickOpportunity({
      grown: usdToMicro(50),
      next: dinner,
      remaining: usdToMicro(200),
      holdings: [holding({ mint: 'SOL', valueMicro: usdToMicro(102), change24hPct: 2 })],
    });
    expect(pick.kind).toBe('gain');
    expect(pick.mint).toBe('SOL');
    // Roughly $2 appeared, so $3 and $5 must not be on offer.
    for (const amount of pick.amounts) expect(amount).toBeLessThanOrEqual(usdToMicro(2));
  });

  it('ignores a gain too small to be news', () => {
    const pick = pickOpportunity({
      grown: usdToMicro(50),
      next: dinner,
      remaining: usdToMicro(200),
      holdings: [holding({ valueMicro: usdToMicro(100.1), change24hPct: 0.1 })],
    });
    expect(pick.kind).not.toBe('gain');
  });

  it('still offers the standard menu on a red day', () => {
    // ⚠️ A falling market used to REPLACE the offer with a remark about the
    // market. Tested, that read as a wall: the menu vanished, on every load,
    // with no way past it, in front of the one thing the user came to do. A
    // red day is not a reason to stop offering — the warning about selling a
    // falling asset belongs on the Grow screen, where that choice is made.
    const pick = pickOpportunity({
      grown: usdToMicro(284),
      next: dinner,
      remaining: usdToMicro(200),
      holdings: [holding({ valueMicro: usdToMicro(90), change24hPct: -10 })],
    });

    expect(pick.kind).toBe('routine');
    expect(pick.amounts.length).toBeGreaterThan(0);
  });

  it('never returns an opportunity with nothing to act on', () => {
    for (const change of [-90, -10, -0.1, 0, 0.1, 12]) {
      const pick = pickOpportunity({
        grown: usdToMicro(284),
        next: dinner,
        remaining: usdToMicro(200),
        holdings: [holding({ valueMicro: usdToMicro(90), change24hPct: change })],
      });
      expect(pick.amounts.length).toBeGreaterThan(0);
    }
  });

  it('falls back to routine on a flat day, without inventing urgency', () => {
    const pick = pickOpportunity({
      grown: usdToMicro(50),
      next: dinner,
      remaining: usdToMicro(200),
      holdings: [holding({ change24hPct: 0 })],
    });
    expect(pick.kind).toBe('routine');
    expect(pick.amounts.length).toBeGreaterThan(0);
  });

  it('names the asset it is about to sell, on every opportunity that asks', () => {
    const cases = [
      { grown: usdToMicro(23), remaining: usdToMicro(2), change: 0 }, // milestone
      { grown: usdToMicro(50), remaining: usdToMicro(200), change: 5 }, // gain
      { grown: usdToMicro(50), remaining: usdToMicro(200), change: 0 }, // routine
    ];
    for (const c of cases) {
      const pick = pickOpportunity({
        grown: c.grown,
        next: dinner,
        remaining: c.remaining,
        holdings: [holding({ name: 'Solana', change24hPct: c.change })],
      });
      // Anything the engine returns must be something the user can act on.
      expect(pick.amounts.length).toBeGreaterThan(0);
      expect(pick.mint).not.toBeNull();
    }
  });

  it('names no asset when there is nothing to sell', () => {
    const pick = pickOpportunity({
      grown: usdToMicro(284),
      next: dinner,
      remaining: usdToMicro(200),
      holdings: [],
    });
    expect(pick.mint).toBeNull();
  });

  it('never asks for $0.00 when the gap is a fraction of a cent', () => {
    // The mock port delivers 20bps under the quote, so a "$1" Grow lands at
    // $0.998 and leaves two tenths of a cent to Coffee. That produced a button
    // reading `Finish it $0.00` — an ask for nothing, rounded into existence.
    const pick = pickOpportunity({
      grown: 998_000,
      next: { id: 'coffee', label: 'Coffee', thresholdUsd: 1 } as Milestone,
      remaining: 2_000,
      holdings: [holding()],
    });
    expect(pick.kind).toBe('milestone');
    expect(pick.amounts[0]).toBeGreaterThanOrEqual(usdToMicro(0.25));
    // And it must not print a zero-dollar gap at the user either.
    expect(pick.body).not.toContain('$0.00');
    expect(pick.body).toContain('Coffee');
  });

  it('survives an empty wallet', () => {
    const pick = pickOpportunity({ grown: 0, next: dinner, remaining: usdToMicro(25), holdings: [] });
    expect(pick.kind).toBe('routine');
    expect(pick.mint).toBeNull();
  });

  it('never offers an amount below the floor where fees dominate', () => {
    for (const change of [0.6, 2, 50, -10, 0]) {
      const pick = pickOpportunity({
        grown: usdToMicro(10),
        next: dinner,
        remaining: usdToMicro(15),
        holdings: [holding({ valueMicro: usdToMicro(100), change24hPct: change })],
      });
      for (const amount of pick.amounts) expect(amount).toBeGreaterThanOrEqual(usdToMicro(0.25));
    }
  });
});

describe('closing a gap out of dollars', () => {
  it('asks for the gap exactly, with no slippage pad', () => {
    // The 2% pad buys headroom against swap slippage. A USDC Grow is a
    // transfer — out equals in — so padding it asked $1.02 to close a $1.00
    // gap, which is a number nobody could explain.
    const found = pickOpportunity({
      grown: 0,
      next: { id: 'coffee', label: 'Coffee', thresholdUsd: 1 } as Milestone,
      remaining: usdToMicro(1),
      holdings: [holding({ mint: USDC.mint, name: 'USD Coin', valueMicro: usdToMicro(600) })],
    });

    expect(found.amounts).toEqual([usdToMicro(1)]);
  });

  it('takes the gap out of dollars even when a meme coin is up today', () => {
    // Seen in the running app 2026-09-02: the card offered "Finish it $1.02"
    // because the day's biggest riser was a $0.29 meme coin — an ask padded for
    // slippage, out of an asset that could not cover a third of it.
    const found = pickOpportunity({
      grown: 0,
      next: { id: 'coffee', label: 'Coffee', thresholdUsd: 1 } as Milestone,
      remaining: usdToMicro(1),
      holdings: [
        holding({ mint: 'BAOBAO', name: 'BaoBao', valueMicro: usdToMicro(0.29), change24hPct: 3.71 }),
        holding({ mint: USDC.mint, name: 'USD Coin', valueMicro: usdToMicro(674) }),
      ],
    });

    expect(found.mint).toBe(USDC.mint);
    expect(found.amounts).toEqual([usdToMicro(1)]);
  });

  it('still pads when a swap has to clear the gap', () => {
    const found = pickOpportunity({
      grown: 0,
      next: { id: 'coffee', label: 'Coffee', thresholdUsd: 1 } as Milestone,
      remaining: usdToMicro(1),
      holdings: [holding({ name: 'Unicorn', valueMicro: usdToMicro(600) })],
    });

    expect(found.amounts).toEqual([usdToMicro(1.02)]);
  });
});
