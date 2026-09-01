import { Buffer } from 'buffer';
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { USDC } from '../../config/tokens';
import { connection } from '../solana/connection';
import { assertValidSeed, GROW_ACCOUNT_SEED } from './seed';

export { GROW_ACCOUNT_SEED } from './seed';

/**
 * The Grow Account — a dedicated USDC token account owned by the user's own wallet.
 *
 * ## What this replaced, and why
 *
 * The first attempt derived a SECOND KEYPAIR as `SHA-256(wallet signature over a
 * fixed message)`. That was a critical vulnerability, not a subtlety: an ed25519
 * signature is deterministic but it is NOT a secret — signatures exist to be
 * handed out and verified. The derivation message was a public constant in this
 * source, so any site could ask a user to sign that exact string, hash the
 * signature FORWARD, and hold the Grow Account's private key. Nothing needed to
 * be inverted. Removed before a single lamport was ever sent to it.
 *
 * ## What this is instead
 *
 * No second key exists. One owner may hold many SPL token accounts for the same
 * mint — the associated token account is merely the canonical one — so Grow
 * gives the user a second USDC account at an address derived from their own
 * wallet with `createAccountWithSeed`:
 *
 *     address = f(wallet pubkey, "grow-usdc-v1", SPL Token program)
 *
 * It is recomputable anywhere from the connected wallet alone: no stored secret,
 * no local storage, no vendor, no recovery phrase. Its token authority is the
 * user's existing wallet, so only they can move the money and Grow never can.
 *
 * ## Verified, not assumed — mainnet, 2026-08-30
 *
 * `createAccountWithSeed` + `InitializeAccount3` simulated clean on mainnet:
 * one required signature (the user), rent 0.002039 SOL, both programs returning
 * success. The address recomputed identically and differed per wallet. DFlow
 * accepted the resulting account as `destinationTokenAccount` and referenced it
 * in the transaction it built.
 *
 * ## The trade-off, stated plainly
 *
 * Because the authority is the user's normal wallet, other Solana software that
 * enumerates token accounts can see and spend this balance. The guarantee here
 * is *the money is genuinely separated on chain*, NOT *the money cannot be
 * spent*. Only a Verified Commitment makes the second promise.
 */

/** SPL Token program. Also the owner program the address is derived against. */
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/** A token account is a fixed 165 bytes. */
export const TOKEN_ACCOUNT_SIZE = 165;

/** Associated Token program, for the user's ordinary USDC account. */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

/** `InitializeAccount3` — takes the owner as data instead of a Rent sysvar. */
const IX_INITIALIZE_ACCOUNT_3 = 18;
/** SPL Token `Transfer`. */
const IX_TRANSFER = 3;
/** Associated Token `CreateIdempotent` — safe when the account already exists. */
const IX_CREATE_ATA_IDEMPOTENT = 1;

/**
 * Where this wallet's Grow savings live. Pure function of the wallet address —
 * the same everywhere, forever, with nothing remembered.
 */
export async function growAccountAddress(ownerPubkey: string): Promise<string> {
  assertValidSeed();
  const address = await PublicKey.createWithSeed(
    new PublicKey(ownerPubkey),
    GROW_ACCOUNT_SEED,
    TOKEN_PROGRAM_ID,
  );
  return address.toBase58();
}

/** Whether the account has been created on chain yet. */
export async function growAccountExists(address: string): Promise<boolean> {
  return (await connection().getAccountInfo(new PublicKey(address))) !== null;
}

/**
 * The one-time transaction that opens the account.
 *
 * DFlow requires `destinationTokenAccount` to exist before execution, so this
 * runs before the first Grow rather than alongside it.
 */
export async function buildOpenGrowAccountTx(ownerPubkey: string): Promise<VersionedTransaction> {
  const owner = new PublicKey(ownerPubkey);
  const address = new PublicKey(await growAccountAddress(ownerPubkey));
  const rpc = connection();

  const lamports = await rpc.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);

  const create = SystemProgram.createAccountWithSeed({
    fromPubkey: owner,
    basePubkey: owner,
    seed: GROW_ACCOUNT_SEED,
    newAccountPubkey: address,
    lamports,
    space: TOKEN_ACCOUNT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  });

  // Token authority is the user's own wallet — that is the whole security model.
  const data = new Uint8Array(1 + 32);
  data[0] = IX_INITIALIZE_ACCOUNT_3;
  data.set(owner.toBytes(), 1);

  const initialize = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: address, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(USDC.mint), isSigner: false, isWritable: false },
    ],
    // `buffer` is already a dependency and polyfilled at app start; the
    // instruction type requires a Buffer rather than a bare Uint8Array.
    data: Buffer.from(data),
  });

  const { blockhash } = await rpc.getLatestBlockhash();
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: owner,
      recentBlockhash: blockhash,
      instructions: [create, initialize],
    }).compileToV0Message(),
  );
}

/** The user's ordinary USDC account — where a withdrawal lands. */
export function usdcAtaFor(ownerPubkey: string): PublicKey {
  const owner = new PublicKey(ownerPubkey);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), new PublicKey(USDC.mint).toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

/**
 * Keep part of a dollar balance — the plainest Grow there is.
 *
 * Growing from USDC is NOT A SWAP. There is no route, no venue, no slippage and
 * no quote: it is an SPL transfer between two accounts the user already owns,
 * and the amount that arrives is the amount in the instruction. That makes it
 * the most reliable path in the product, and the one that finally lets someone
 * split a balance — some to spend, some to keep — instead of being told their
 * largest holding is the one thing they cannot save.
 *
 * ⚠️ ONE INSTRUCTION DRAINS ONE ACCOUNT. `from` is a specific token account,
 * not the wallet: a wallet may hold the same mint in many accounts (this one
 * holds two, a tested one held fourteen), and a transfer sourced from the
 * summed balance would ask an account for money that is sitting in a different
 * one. The caller passes the account the amount was sized against.
 *
 * No destination is created here: the Grow Account must already exist, which is
 * enforced before any Grow can start.
 */
export async function buildDepositTx(
  ownerPubkey: string,
  amountAtomic: bigint,
  fromAccount: string,
): Promise<VersionedTransaction> {
  if (amountAtomic <= 0n) throw new Error('Nothing to keep.');

  const owner = new PublicKey(ownerPubkey);
  const from = new PublicKey(fromAccount);
  const to = new PublicKey(await growAccountAddress(ownerPubkey));
  if (from.equals(to)) throw new Error('That money is already in your Grow.');

  // Transfer: [3, amount as u64 little-endian].
  const data = new Uint8Array(9);
  data[0] = IX_TRANSFER;
  new DataView(data.buffer).setBigUint64(1, amountAtomic, true);

  const transfer = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: from, isSigner: false, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });

  const { blockhash } = await connection().getLatestBlockhash();
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: owner,
      recentBlockhash: blockhash,
      instructions: [transfer],
    }).compileToV0Message(),
  );
}

/**
 * Take money back out.
 *
 * Flexible Grow is savings, not a prison: the Grow Account's authority is the
 * user's own wallet, so a withdrawal is an ordinary SPL transfer they sign.
 * Nothing in Grow can block it, and nothing needs to ask permission.
 *
 * The destination ATA is created idempotently — a wallet that has never held
 * USDC has no account to receive it, and that must not be a failed withdrawal.
 */
export async function buildWithdrawTx(
  ownerPubkey: string,
  amountAtomic: bigint,
): Promise<VersionedTransaction> {
  if (amountAtomic <= 0n) throw new Error('Nothing to take out.');

  const owner = new PublicKey(ownerPubkey);
  const from = new PublicKey(await growAccountAddress(ownerPubkey));
  const to = usdcAtaFor(ownerPubkey);
  const rpc = connection();

  const createAta = new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(USDC.mint), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([IX_CREATE_ATA_IDEMPOTENT]),
  });

  // Transfer: [3, amount as u64 little-endian].
  const data = new Uint8Array(9);
  data[0] = IX_TRANSFER;
  new DataView(data.buffer).setBigUint64(1, amountAtomic, true);

  const transfer = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: from, isSigner: false, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });

  const { blockhash } = await rpc.getLatestBlockhash();
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: owner,
      recentBlockhash: blockhash,
      instructions: [createAta, transfer],
    }).compileToV0Message(),
  );
}
