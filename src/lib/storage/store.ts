import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Namespaced persistence — Q6.
 *
 * Every key is scoped to the wallet pubkey. Without this, wallet B opens the app
 * and sees wallet A's total, Collection and history: a money-correctness failure,
 * and a live hazard the moment you switch wallets mid-demo. Nothing in the app
 * may build a storage key by hand.
 */
export const NAMESPACE = 'grow:v1';

export type StorageSuffix =
  | 'actions'
  | 'unlocks'
  | 'handle'
  | 'onboarded'
  | 'hints'
  | 'goal'
  /** How much of the total the chain knew about and this device did not. */
  | 'recovered';

export function keyFor(pubkey: string, suffix: StorageSuffix): string {
  if (!pubkey) throw new Error('keyFor: refusing to build an unscoped storage key');
  return `${NAMESPACE}:${pubkey}:${suffix}`;
}

/**
 * Keys that belong to the DEVICE rather than to a wallet.
 *
 * The walkthrough runs BEFORE anyone connects, so there is no pubkey to scope
 * it to — and scoping it to one would be wrong anyway: a person who has already
 * been told what Grow is does not need telling again because they switched
 * wallets. This is the only category of key allowed to be unscoped, which is why
 * it gets its own narrow type instead of a hole in `keyFor`.
 *
 * `device` can never collide with a pubkey: base58 keys are 32-44 characters.
 */
export type DeviceSuffix = 'walkthrough';

export function deviceKey(suffix: DeviceSuffix): string {
  return `${NAMESPACE}:device:${suffix}`;
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or unreadable storage must never wedge the app on launch.
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function clearFor(pubkey: string): Promise<void> {
  const suffixes: StorageSuffix[] = [
    'actions',
    'unlocks',
    'handle',
    'onboarded',
    'hints',
    'goal',
    'recovered',
  ];
  await AsyncStorage.multiRemove(suffixes.map((s) => keyFor(pubkey, s)));
}

/**
 * Everything a Grow earned, and nothing about who the user is.
 *
 * Closing a Grow starts the ladder over; it does not make the app forget your
 * handle or replay the first-run sequence at someone who has already seen it.
 */
export async function clearProgressFor(pubkey: string): Promise<void> {
  const suffixes: StorageSuffix[] = ['actions', 'unlocks', 'goal', 'recovered'];
  await AsyncStorage.multiRemove(suffixes.map((s) => keyFor(pubkey, s)));
}
