import type { GrowAction } from '../domain/growAction';
import { usdToMicro } from '../domain/money';
import { USDC, WSOL } from './tokens';

/**
 * Demo Mode — Q14.
 *
 * The demo script needs an account sitting just under a large milestone (iPhone
 * at 94%, $72 to go) so the crossing can be shown live. Staging $1,127 of real
 * mainnet capital to rehearse that is not realistic, so this seeds the LOCAL
 * LEDGER instead.
 *
 * Hard rules, so a seeded state can never be mistaken for a real one:
 *  - env-gated, off by default, and never enabled in a build that moves money
 *  - every row carries a `demo:` signature prefix, so it is identifiable
 *  - it seeds only when the wallet has no real history at all
 *  - it emits nothing outward and moves no real funds
 *
 * A Grow performed on top of a seeded ledger is still a REAL swap. Demo Mode
 * changes the starting number, never the money path.
 */
export const DEMO_SIGNATURE_PREFIX = 'demo:';

/** $1,127.06 — 94% of the way to iPhone at $1,199. */
const DEMO_STEPS: readonly number[] = [1, 1, 3, 5, 15, 25, 50, 100, 250, 350, 327.06];

export const DEMO_ACTIONS: readonly GrowAction[] = DEMO_STEPS.map((usd, index) => ({
  id: `${DEMO_SIGNATURE_PREFIX}${index}`,
  status: 'confirmed' as const,
  inputMint: index % 2 === 0 ? WSOL.mint : USDC.mint,
  inputAmountAtomic: '0',
  quotedOutMicro: usdToMicro(usd),
  minOutMicro: usdToMicro(usd),
  signature: `${DEMO_SIGNATURE_PREFIX}${index}`,
  lastValidBlockHeight: null,
  usdcReceivedMicro: usdToMicro(usd),
  createdAt: Date.now() - (DEMO_STEPS.length - index) * 86_400_000,
  updatedAt: Date.now() - (DEMO_STEPS.length - index) * 86_400_000,
}));

export function isDemoAction(action: GrowAction): boolean {
  return action.signature?.startsWith(DEMO_SIGNATURE_PREFIX) ?? false;
}
