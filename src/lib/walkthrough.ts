import { useEffect, useState } from 'react';

import { deviceKey, readJson, writeJson } from './storage/store';

const KEY = deviceKey('walkthrough');

/**
 * Whether this device has been told what Grow is.
 *
 * Device-scoped, not wallet-scoped — see `deviceKey`. The walkthrough runs
 * before anyone connects, so there is no pubkey to scope it to.
 *
 * The answer is cached in module scope after the first read. Without that,
 * finishing the deck and replacing back to auth re-mounts the auth screen with
 * `seen` at `null` again, and the user gets a blank frame — or worse, a second
 * lap of the walkthrough — while storage answers a question we just wrote to it.
 */
let cached: boolean | null = null;

export function useWalkthroughSeen(): boolean | null {
  const [seen, setSeen] = useState<boolean | null>(cached);

  useEffect(() => {
    if (cached !== null) {
      setSeen(cached);
      return;
    }
    let cancelled = false;
    void readJson<boolean>(KEY, false).then((value) => {
      cached = value;
      if (!cancelled) setSeen(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return seen;
}

export async function markWalkthroughSeen(): Promise<void> {
  cached = true;
  await writeJson(KEY, true);
}

/** Settings, so someone can be shown the pitch again — or show it to a friend. */
export async function resetWalkthrough(): Promise<void> {
  cached = false;
  await writeJson(KEY, false);
}
