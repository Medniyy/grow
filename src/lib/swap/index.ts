import { env } from '../../config/env';
import { dflowSwapPort } from './dflow';
import { mockSwapPort } from './mock';
import type { SwapPort } from './port';

export * from './port';

/** DFlow is the money path. The mock exists only for rehearsal and tests. */
export function swapPort(): SwapPort {
  return env.mockSwap ? mockSwapPort : dflowSwapPort;
}
