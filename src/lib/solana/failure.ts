/**
 * What a failed transaction says to the user.
 *
 * ⚠️ A chain error is not a message. `SendTransactionError.message` carries the
 * whole simulation dump — every `Program data:` blob, every compute-unit line —
 * and rendering it verbatim printed forty lines of base64 over the top of the
 * Grow screen, burying its own title. The user learned nothing they could act
 * on, and the one fact that mattered (`exceeded CUs meter`) was on line 38.
 *
 * So the raw text is matched, not shown. Every branch answers the only two
 * questions a person has at that moment: is my money gone, and what do I do
 * now. When nothing matches, the honest answer is a short sentence — never the
 * dump.
 */

/** Money is only at risk once a transaction lands; a simulation never spends. */
const NOTHING_SPENT = 'Nothing was spent.';

export function humanTransactionError(cause: unknown): string {
  // DFlow already answers for itself — `route_not_found` becomes "No route for
  // that amount right now. Try a slightly larger amount.", which is more useful
  // than anything below. Matched by NAME so this module stays free of the DFlow
  // client and the two cannot form an import cycle.
  if (cause instanceof Error && cause.name === 'DFlowRequestError') return cause.message;

  const raw = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
  const text = raw.toLowerCase();

  // Checked first: a cancelled wallet dialog is not a failure and must never
  // be dressed as one.
  if (/user rejected|user denied|rejected the request|request rejected/.test(text)) {
    return 'You cancelled that in your wallet. Nothing happened.';
  }

  // The route did not fit in the transaction's compute budget. Measured on
  // mainnet 2026-08-31 on a USDT Grow — see `dynamicComputeUnitLimit`, which is
  // the fix. This branch is what a route too long for even a simulated budget
  // looks like from here.
  if (/exceeded cus meter|computationalbudgetexceeded|program failed to complete/.test(text)) {
    return `That route was too long to fit in one transaction. ${NOTHING_SPENT} Try another asset.`;
  }

  // 0x3a99. A volatile token can walk through the tolerance in the seconds a
  // human spends reading a wallet dialog.
  if (/slippage|0x3a99/.test(text)) {
    return `The price moved while you were approving. ${NOTHING_SPENT} Try again.`;
  }

  if (/insufficient (funds|lamports)|0x1\b/.test(text)) {
    return `Not enough in that account to cover the Grow and its fee. ${NOTHING_SPENT}`;
  }

  if (/blockhash not found|block height exceeded|transactionexpired/.test(text)) {
    return `That expired before it landed. ${NOTHING_SPENT} Try again.`;
  }

  // No `Nothing was spent` here: this fires while pricing too, where nothing was
  // ever attempted, and the reassurance would imply that something was.
  if (/failed to fetch|network|econnrefused|enotfound|502|503|504/.test(text)) {
    return 'Grow could not reach the network. Try again.';
  }

  // A single line, and never the dump. The full text still reaches the console
  // through the caller, which is where a developer should be looking anyway.
  return `That Grow did not go through. ${NOTHING_SPENT}`;
}
