import { VersionedTransaction } from '@solana/web3.js';
// Imported explicitly rather than leaning on the global the root layout installs,
// so this module type-checks and works regardless of load order.
import { Buffer } from 'buffer';
import { useCallback, useEffect, useRef, useState } from 'react';

import { env } from '../config/env';
import { USDC } from '../config/tokens';
import type { GrowAction } from '../domain/growAction';
import { transition } from '../domain/growAction';
import { inputAtomicFor, validateGrowAmount } from '../domain/growPlan';
import { type MicroUsd, usdToMicro } from '../domain/money';
import { newId } from '../lib/ids';
import { buildDepositTx } from '../lib/growAccount';
import { connection } from '../lib/solana/connection';
import { awaitSignature, checkSignature, confirmGrow } from '../lib/solana/confirm';
import { signatureOf } from '../lib/solana/signature';
import { humanTransactionError } from '../lib/solana/failure';
import { type GrowQuote, swapPort } from '../lib/swap';
import { useWallet } from '../lib/wallet';
import { useGrowAccount } from './growAccount';
import { useGrow } from './growStore';
import { type PortfolioEntry, usePortfolio } from './portfolio';

export type FlowPhase =
  | 'idle'
  | 'quoting'
  | 'awaiting-signature'
  | 'submitting'
  | 'pending'
  | 'done'
  | 'error';

export function useGrowFlow() {
  const wallet = useWallet();
  const grow = useGrow();
  const growAccount = useGrowAccount();
  const portfolio = usePortfolio();

  const [phase, setPhase] = useState<FlowPhase>('idle');
  const [quote, setQuote] = useState<GrowQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justUnlocked, setJustUnlocked] = useState<readonly string[]>([]);

  const quoteToken = useRef<AbortController | null>(null);

  /** Price-only. No transaction is built, so there is nothing to sign or lose. */
  const requestQuote = useCallback(async (targetMicro: MicroUsd, entry: PortfolioEntry) => {
    quoteToken.current?.abort();
    const controller = new AbortController();
    quoteToken.current = controller;

    setPhase('quoting');
    setError(null);

    // Dollars into dollars. There is nothing to price and nobody to ask, and
    // sending it to a router would invent a spread where none exists.
    if (entry.mint === USDC.mint) {
      const exact: GrowQuote = {
        inputMint: entry.mint,
        inputAmountAtomic: String(targetMicro),
        outMicro: targetMicro,
        minOutMicro: targetMicro,
        slippageBps: 0,
        venues: [],
        priceImpactPct: 0,
      };
      setQuote(exact);
      setPhase('idle');
      return exact;
    }

    try {
      const amount = inputAtomicFor(targetMicro, entry.priceUsd, entry.decimals).toString();
      const result = await swapPort().quote(
        {
          inputMint: entry.mint,
          inputAmountAtomic: amount,
          // Ignored by the live port; the rehearsal port cannot be honest without it.
          inputPriceUsd: entry.priceUsd,
          inputDecimals: entry.decimals,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return null;
      setQuote(result);
      setPhase('idle');
      return result;
    } catch (e) {
      if (controller.signal.aborted) return null;
      setQuote(null);
      console.warn('quote failed:', e);
      setError(humanTransactionError(e));
      setPhase('error');
      return null;
    }
  }, []);

  /**
   * Growing from USDC: a transfer, not a swap.
   *
   * Same state machine, same persist-before-broadcast ordering (Q3), same
   * ledger row — only the transaction differs, and so does where the recorded
   * figure comes from.
   *
   * ⚠️ THE AMOUNT IS NOT READ BACK OFF THE CHAIN, AND THAT IS CORRECT HERE.
   * Q5 forbids substituting a QUOTE for the settled figure, because a quote
   * drifts from execution. A transfer has no quote: the amount is a field of
   * the instruction, and the transaction either moved exactly that or failed
   * outright. Reading it back would in fact be WORSE — `usdcDeltaFrom` sums a
   * mint across everything the OWNER holds, and both accounts here have the
   * same owner, so a self-transfer nets to zero and would record a $0 Grow.
   */
  const keepDollars = useCallback(
    async (targetMicro: MicroUsd, entry: PortfolioEntry) => {
      if (!wallet.publicKey) return;
      if (!entry.sourceAccount) {
        setError('Could not find which account that money is in.');
        setPhase('error');
        return;
      }

      // USDC has 6 decimals and micro-USD is 1e-6, so the micro amount IS the
      // atomic amount. No conversion, therefore no rounding, therefore nothing
      // that can ask for a fraction more than the account holds.
      const atomic = BigInt(targetMicro);

      let row: GrowAction = {
        id: newId(),
        status: 'quoted',
        inputMint: entry.mint,
        inputAmountAtomic: atomic.toString(),
        quotedOutMicro: targetMicro,
        minOutMicro: targetMicro,
        signature: null,
        lastValidBlockHeight: null,
        usdcReceivedMicro: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      try {
        setPhase('awaiting-signature');
        // ⚠️ The expiry comes back WITH the transaction, from the same
        // `getLatestBlockhash` that produced the blockhash inside it. Fetching a
        // second one here described a different block — see `BuiltTransaction`.
        const { transaction, lastValidBlockHeight } = await buildDepositTx(
          wallet.publicKey,
          atomic,
          entry.sourceAccount,
        );
        const signed = await wallet.signTransaction(transaction);

        const signature = signatureOf(signed);
        row = transition(row, 'submitted', { signature, lastValidBlockHeight });
        await grow.recordAction(row); // persisted BEFORE the network sees it

        setPhase('submitting');
        await connection().sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });

        row = transition(row, 'pending');
        await grow.recordAction(row);
        setPhase('pending');

        const outcome = await awaitSignature(signature, lastValidBlockHeight);
        if (outcome.status === 'confirmed') {
          row = transition(row, 'confirmed', { usdcReceivedMicro: targetMicro });
          const fresh = await grow.recordAction(row);
          setJustUnlocked(fresh);
          setPhase('done');
          portfolio.refresh();
          growAccount.refresh();
        } else if (outcome.status === 'timeout') {
          // ⚠️ THE ROW IS LEFT OPEN. We stopped waiting; the chain did not stop
          // working. Writing 'failed' here is terminal and reconciliation would
          // never look at it again — see `ConfirmOutcome`.
          setError('That Grow is taking longer than usual. It has not failed — Grow will pick it up the next time you open the app.');
          setPhase('error');
        } else {
          row = transition(row, outcome.status);
          await grow.recordAction(row);
          setError(
            outcome.status === 'expired'
              ? 'That Grow expired before it landed. Nothing was spent.'
              : (outcome.message ?? 'That Grow did not go through.'),
          );
          setPhase('error');
        }
      } catch (e) {
        console.warn('keep failed:', e);
        setError(humanTransactionError(e));
        setPhase('error');
      }
    },
    [grow, growAccount, portfolio, wallet],
  );

  /**
   * The whole money path. The ordering here is the point:
   * quote+build -> sign -> PERSIST the signed row -> broadcast -> confirm ->
   * read the on-chain figure -> write the ledger.
   *
   * Persisting before broadcasting is Q3. If the app dies immediately after
   * signing, the USDC still lands in the wallet, and only a persisted row lets
   * cold-start reconciliation find it. Writing on confirmation alone loses that
   * money permanently.
   */
  const execute = useCallback(
    async (targetMicro: MicroUsd, entry: PortfolioEntry) => {
      if (!wallet.publicKey) return;

      // Q14 — mainnet, real funds. Enforced here, not only on a button.
      const problem = validateGrowAmount(targetMicro);
      if (problem) {
        setError(problem.message);
        setPhase('error');
        return;
      }
      if (!wallet.capabilities.canSign || !wallet.capabilities.supportsV0) {
        setError('This wallet cannot sign the transaction DFlow builds. Try Phantom or Solflare.');
        setPhase('error');
        return;
      }
      // DFlow requires `destinationTokenAccount` to already exist. Growing
      // without one would quietly return the USDC to the spending wallet, which
      // is the exact outcome this whole design exists to prevent.
      if (!env.mockSwap && (!growAccount.address || growAccount.exists !== true)) {
        setError('Open your Grow first — it is where the money goes.');
        setPhase('error');
        return;
      }

      setError(null);
      setJustUnlocked([]);

      if (entry.mint === USDC.mint && !env.mockSwap) {
        await keepDollars(targetMicro, entry);
        return;
      }

      let row: GrowAction;
      try {
        const amount = inputAtomicFor(targetMicro, entry.priceUsd, entry.decimals).toString();

        setPhase('quoting');
        const order = await swapPort().buildOrder({
          inputMint: entry.mint,
          inputAmountAtomic: amount,
          userPublicKey: wallet.publicKey,
          // THE POINT OF A GROW: the USDC lands in the Grow Account, never back
          // in the spending balance. Without this the swap is just a swap.
          destinationTokenAccount: growAccount.address ?? undefined,
          // Ignored by the live port; the rehearsal port cannot be honest without it.
          inputPriceUsd: entry.priceUsd,
          inputDecimals: entry.decimals,
        });
        setQuote(order);

        row = {
          id: newId(),
          status: 'quoted',
          inputMint: entry.mint,
          inputAmountAtomic: amount,
          quotedOutMicro: order.outMicro,
          minOutMicro: order.minOutMicro,
          signature: null,
          lastValidBlockHeight: order.lastValidBlockHeight,
          usdcReceivedMicro: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Rehearsal (Q14): drive the identical state machine without spending.
        if (env.mockSwap) {
          setPhase('pending');
          const submitted = transition(row, 'submitted', { signature: `mock-${row.id}` });
          await grow.recordAction(submitted);
          const confirmed = transition(transition(submitted, 'pending'), 'confirmed', {
            usdcReceivedMicro: order.minOutMicro,
          });
          const fresh = await grow.recordAction(confirmed);
          setJustUnlocked(fresh);
          setPhase('done');
          return;
        }

        setPhase('awaiting-signature');
        const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
        const signed = await wallet.signTransaction(tx);

        const signature = signatureOf(signed);
        row = transition(row, 'submitted', { signature });
        await grow.recordAction(row); // persisted BEFORE the network sees it

        setPhase('submitting');
        await connection().sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });

        row = transition(row, 'pending');
        await grow.recordAction(row);
        setPhase('pending');

        // ⚠️ THE GROW ACCOUNT, NOT THE WALLET. The amount is measured in the
        // account the dollars were promised to, so a swap that lands anywhere
        // else — a dropped `destinationTokenAccount`, an API that changed under
        // us — is a failure and not a silently successful Grow.
        const outcome = await confirmGrow(
          signature,
          order.lastValidBlockHeight,
          // Non-null past the guard at the top of `execute`, which refuses to
          // start a real Grow without an open Grow Account, and past the mock
          // branch above, which has already returned.
          growAccount.address as string,
        );

        if (outcome.status === 'confirmed') {
          row = transition(row, 'confirmed', { usdcReceivedMicro: outcome.usdcReceivedMicro });
          const fresh = await grow.recordAction(row);
          setJustUnlocked(fresh);
          setPhase('done');
          portfolio.refresh();
          // The kept balance is the product's central number and it just moved.
          growAccount.refresh();
        } else if (outcome.status === 'timeout') {
          // Left open on purpose, exactly as in `keepDollars`.
          setError('That Grow is taking longer than usual. It has not failed — Grow will pick it up the next time you open the app.');
          setPhase('error');
        } else {
          row = transition(row, outcome.status);
          await grow.recordAction(row);
          setError(
            outcome.status === 'expired'
              ? 'That Grow expired before it landed. Nothing was spent.'
              : (outcome.message ?? 'That Grow did not go through.'),
          );
          setPhase('error');
        }
      } catch (e) {
        // A row that exists but never reached a terminal state is left alone on
        // purpose — reconciliation owns it from here.
        //
        // The raw cause goes to the console and a SENTENCE goes to the screen.
        // `SendTransactionError.message` is the entire simulation dump, and
        // putting it in the UI buried the Grow screen under base64.
        console.warn('grow failed:', e);
        setError(humanTransactionError(e));
        setPhase('error');
      }
    },
    [grow, growAccount, keepDollars, portfolio, wallet],
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setJustUnlocked([]);
  }, []);

  return { phase, quote, error, justUnlocked, requestQuote, execute, reset };
}

/**
 * Cold-start reconciliation — Q3.
 *
 * Every non-terminal row is chased down against the chain on launch. Without
 * this, an app killed between signing and confirming leaves real USDC in the
 * wallet and nothing in the ledger.
 */
export function useReconciliation() {
  const { publicKey } = useWallet();
  const grow = useGrow();
  const growAccount = useGrowAccount();
  const done = useRef<string | null>(null);
  const destination = growAccount.address;

  useEffect(() => {
    if (!publicKey || grow.loading || env.mockSwap) return;
    // The Grow Account address is derived a tick after mount and every amount is
    // measured inside it. Waiting is right: reconciling against an unknown
    // destination would classify perfectly good rows as failures.
    if (!destination) return;
    if (done.current === publicKey) return;
    done.current = publicKey;

    (async () => {
      for (const row of grow.actions) {
        if (row.status === 'confirmed' || row.status === 'failed' || row.status === 'expired') {
          continue;
        }
        if (!row.signature || row.lastValidBlockHeight == null) continue;

        /**
         * ⚠️ ONE BAD ROW MUST NOT STOP THE REST. This was a single unguarded
         * loop: a throw anywhere in it — a storage write, an RPC hiccup —
         * abandoned every later row, and `done` had already been set, so
         * nothing tried again until the next launch.
         */
        try {
          const outcome = await checkSignature(
            row.signature,
            row.lastValidBlockHeight,
            destination,
          );
          if (outcome.status === 'confirmed') {
            // Read from the chain for USDC rows too. That used to be impossible
            // — the delta was measured per OWNER, and a transfer between two
            // accounts of the same owner nets to zero — so the row's own figure
            // was trusted instead. Measured inside the destination it is a
            // straightforward positive delta, and Q5 gets its way everywhere.
            await grow.recordAction(
              transition(row, 'confirmed', { usdcReceivedMicro: outcome.usdcReceivedMicro }),
            );
          } else if (outcome.status === 'expired') {
            await grow.recordAction(transition(row, 'expired'));
          }
          // 'timeout' means the chain has not decided yet — leave the row open
          // and ask again next launch.
        } catch (cause) {
          console.warn('reconciliation failed for', row.signature, cause);
        }
      }
    })();
  }, [publicKey, destination, grow.loading, grow.actions, grow]);
}
