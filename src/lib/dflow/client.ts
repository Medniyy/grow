import { env } from '../../config/env';
import { type DFlowOrder, DFlowRequestError, isDFlowError } from './types';

/**
 * The keyless developer endpoint. Despite the name it tracks MAINNET (measured:
 * its contextSlot matches mainnet slot height and it returns mainnet venues).
 * There is no devnet path for the money flow — Q14.
 */
const DEV_ENDPOINT = 'https://dev-quote-api.dflow.net';

export type OrderParams = {
  inputMint: string;
  outputMint: string;
  /** ATOMIC units. Never a UI amount — always build this with `toAtomic`. */
  amount: string;
  /** Omit for price-only (no transaction is built, nothing to sign). */
  userPublicKey?: string;
  slippageBps?: number | 'auto';
  wrapAndUnwrapSol?: boolean;
  /**
   * Existing token account that receives the output.
   *
   * This is what makes a Grow a real transfer of savings rather than a swap
   * back into spending money: the USDC never touches the user's normal balance.
   * DFlow requires the account to EXIST before execution.
   */
  destinationTokenAccount?: string;
  /**
   * Let DFlow SIMULATE the route and size the compute budget from the result.
   *
   * ⚠️ Without it the transaction gets a fixed default limit, and a route of any
   * real length walks straight through it. Measured on mainnet 2026-08-31, a
   * USDT Grow: Jupiter's program burned 139,654 CUs, then DFlow's own program
   * hit `consumed 199700 of 199700` and the whole thing died in simulation with
   * `exceeded CUs meter at BPF instruction`. Nothing was spent, and nothing on
   * screen explained why. DFlow's own FAQ names this exact error and this exact
   * parameter as the fix.
   *
   * It costs latency — the server has to run the simulation — which is why it
   * goes only on the build, never on the price-only quote. A quote assigns no
   * compute budget at all: `computeUnitLimit` comes back "if and only if the
   * request included the user's public key".
   */
  dynamicComputeUnitLimit?: boolean;
};

/**
 * Requests go through the Railway proxy when one is configured, so the
 * production key never ships in a browser bundle (SPEC §13).
 *
 * ⚠️ THE FALLBACK IS OPT-IN. The keyless dev endpoint sends permissive CORS and
 * is fine for local work — but it is rate-limited and unkeyed, and falling back
 * to it SILENTLY meant a production build with an empty `EXPO_PUBLIC_API_BASE_URL`
 * shipped pointed at it with nothing on screen to say so. Env values are inlined
 * at build time, so that is a mistake a rebuild cannot correct by itself.
 * Refusing here costs one env var locally and removes a whole class of launch.
 */
function endpoint(): string {
  if (env.apiBaseUrl) return `${env.apiBaseUrl.replace(/\/$/, '')}/order`;
  if (!env.allowDevEndpoint) {
    throw new Error(
      'No backend is configured. Set EXPO_PUBLIC_API_BASE_URL, or ' +
        'EXPO_PUBLIC_ALLOW_DEV_ENDPOINT=1 to use the keyless dev endpoint locally.',
    );
  }
  return `${DEV_ENDPOINT}/order`;
}

export async function fetchOrder(params: OrderParams, signal?: AbortSignal): Promise<DFlowOrder> {
  const query = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: String(params.slippageBps ?? 'auto'),
  });
  if (params.userPublicKey) query.set('userPublicKey', params.userPublicKey);
  if (params.wrapAndUnwrapSol) query.set('wrapAndUnwrapSol', 'true');
  if (params.destinationTokenAccount) {
    query.set('destinationTokenAccount', params.destinationTokenAccount);
  }
  if (params.dynamicComputeUnitLimit) query.set('dynamicComputeUnitLimit', 'true');

  const response = await fetch(`${endpoint()}?${query.toString()}`, { signal });
  const body: unknown = await response.json();

  if (isDFlowError(body)) throw new DFlowRequestError(body);
  if (!response.ok) throw new Error(`DFlow ${response.status}`);

  return body as DFlowOrder;
}
