import { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
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
        const tx = await buildDepositTx(wallet.publicKey, atomic, entry.sourceAccount);
        const { lastValidBlockHeight } = await connection().getLatestBlockhash();
        const signed = await wallet.signTransaction(tx);

        const signature = bs58.encode(signed.signatures[0]);
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
        } else {
          row = transition(row, outcome.status);
          await grow.recordAction(row);
          setError(
            outcome.status === 'expired'
              ? 'That Grow expired before it landed. Nothing was spent.'
              : 'That Grow did not go through.',
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

        const signature = bs58.encode(signed.signatures[0]);
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

        const outcome = await confirmGrow(signature, order.lastValidBlockHeight, wallet.publicKey);

        if (outcome.status === 'confirmed') {
          row = transition(row, 'confirmed', { usdcReceivedMicro: outcome.usdcReceivedMicro });
          const fresh = await grow.recordAction(row);
          setJustUnlocked(fresh);
          setPhase('done');
          portfolio.refresh();
          // The kept balance is the product's central number and it just moved.
          growAccount.refresh();
        } else {
          row = transition(row, outcome.status);
          await grow.recordAction(row);
          setError(
            outcome.status === 'expired'
              ? 'That Grow expired before it landed. Nothing was spent.'
              : 'That Grow did not go through.',
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
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!publicKey || grow.loading || env.mockSwap) return;
    if (done.current === publicKey) return;
    done.current = publicKey;

    (async () => {
      for (const row of grow.actions) {
        if (row.status === 'confirmed' || row.status === 'failed' || row.status === 'expired') {
          continue;
        }
        if (!row.signature || row.lastValidBlockHeight == null) continue;

        const outcome = await checkSignature(row.signature, row.lastValidBlockHeight, publicKey);
        if (outcome.status === 'confirmed') {
          // A USDC row is a transfer between two accounts of the SAME OWNER, and
          // `checkSignature` measures the delta per owner — so it nets to zero
          // and would resurrect the row as a $0 Grow. The amount was fixed by
          // the instruction, so the row already carries the settled figure.
          const settled =
            row.inputMint === USDC.mint ? row.minOutMicro : outcome.usdcReceivedMicro;
          await grow.recordAction(transition(row, 'confirmed', { usdcReceivedMicro: settled }));
        } else if (outcome.status === 'expired') {
          await grow.recordAction(transition(row, 'expired'));
        }
        // A 'failed' outcome with reason 'still unknown' means the chain has not
        // decided yet — leave the row open and try again next launch.
      }
    })();
  }, [publicKey, grow.loading, grow.actions, grow]);
}
