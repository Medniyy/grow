/**
 * Guards the `kept` read against the two ways it has already been wrong.
 *
 * `@solana/web3.js` is mocked rather than imported: its ESM build cannot load
 * under jest (a bare directory import in `jayson`), which is the same reason
 * `usdcDelta` was split out. Only `PublicKey` is needed here, and only to
 * validate and carry an address.
 */
// Names inside a `jest.mock` factory must start with `mock` — the factory is
// hoisted above every other binding, and babel rejects anything else as a
// possibly-uninitialised reference. Parameter properties (`constructor(readonly
// key: string)`) trip the same check, hence the explicit field.
const mockGetParsedAccountInfo = jest.fn();
const mockGetParsedTokenAccountsByOwner = jest.fn();
const mockGetBalance = jest.fn();

jest.mock('@solana/web3.js', () => ({
  PublicKey: class {
    key: string;
    constructor(key: string) {
      if (!key) throw new Error('Invalid public key');
      this.key = key;
    }
    toBase58() {
      return this.key;
    }
  },
}));

jest.mock('../connection', () => ({
  connection: () => ({
    getParsedAccountInfo: mockGetParsedAccountInfo,
    getParsedTokenAccountsByOwner: mockGetParsedTokenAccountsByOwner,
    getBalance: mockGetBalance,
  }),
}));

import { fetchHoldings, fetchTokenAccountBalance } from '../balances';

const GROW = 'DYPanRenpQpS6p8FWEB1s4EuEmoAXnQ5khiDes4H2umG';
const WALLET = 'EYv6iGu4BPA44HYhsGFApu4pou5d9LcYVooWsvUznpiP';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const tokenAccount = (amount: string) => ({
  value: {
    data: {
      parsed: {
        info: {
          mint: USDC_MINT,
          owner: WALLET,
          tokenAmount: { amount, decimals: 6 },
        },
      },
    },
  },
});

beforeEach(() => {
  mockGetParsedAccountInfo.mockReset();
  mockGetParsedTokenAccountsByOwner.mockReset();
  mockGetBalance.mockReset();
});

describe('fetchTokenAccountBalance', () => {
  it('reads the balance of THE account, not a sum over an owner', async () => {
    mockGetParsedAccountInfo.mockResolvedValue(tokenAccount('1000000'));
    expect(await fetchTokenAccountBalance(GROW)).toBe(1_000_000n);
  });

  it('asks the chain for the Grow Account address itself', async () => {
    // The bug this replaces called `getTokenAccountsByOwner(growAddress)`,
    // which takes an AUTHORITY. The Grow Account's authority is the wallet, so
    // that returned an empty list and pinned `kept` at $0 while real money sat
    // in the account. Verified against mainnet 2026-08-31.
    mockGetParsedAccountInfo.mockResolvedValue(tokenAccount('0'));
    await fetchTokenAccountBalance(GROW);

    expect(mockGetParsedAccountInfo).toHaveBeenCalledTimes(1);
    expect(mockGetParsedAccountInfo.mock.calls[0][0].toBase58()).toBe(GROW);
  });

  it('is zero, not an error, when the account does not exist yet', async () => {
    // Where every Grow Account starts. An error here would show a broken app to
    // every new user on their very first screen.
    mockGetParsedAccountInfo.mockResolvedValue({ value: null });
    expect(await fetchTokenAccountBalance(GROW)).toBe(0n);
  });

  it('reads a full dollar exactly, with no float drift', async () => {
    // USDC has 6 decimals and micro-USD is 1e-6, so the atomic amount IS the
    // micro-dollar amount. BigInt keeps it exact at any size.
    mockGetParsedAccountInfo.mockResolvedValue(tokenAccount('123456789012'));
    expect(await fetchTokenAccountBalance(GROW)).toBe(123_456_789_012n);
  });

  it('throws rather than reporting zero when the address is not a token account', async () => {
    // "Could not read" and "is empty" are different facts, and a wrong address
    // must never be displayed as savings of $0.
    mockGetParsedAccountInfo.mockResolvedValue({ value: { data: new Uint8Array([1, 2, 3]) } });
    await expect(fetchTokenAccountBalance(GROW)).rejects.toThrow('not a token account');
  });

  it('throws when a parsed account carries no token amount', async () => {
    mockGetParsedAccountInfo.mockResolvedValue({ value: { data: { parsed: { info: {} } } } });
    await expect(fetchTokenAccountBalance(GROW)).rejects.toThrow('no token amount');
  });
});

const SPEND = 'DyVMurYHMBR6Rik3QyfGQDutpxoXcbqs9UswUDyantGb';

/** One entry as `getParsedTokenAccountsByOwner` returns it. */
const owned = (pubkey: string, mint: string, amount: string, decimals = 6) => ({
  pubkey: { toBase58: () => pubkey },
  account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } },
});

describe('fetchHoldings', () => {
  const withAccounts = (...accounts: unknown[]) => {
    // Two calls, one per token program; native SOL comes from getBalance.
    mockGetParsedTokenAccountsByOwner
      .mockResolvedValueOnce({ value: accounts })
      .mockResolvedValueOnce({ value: [] });
    mockGetBalance.mockResolvedValue(0);
  };

  it('leaves an excluded account out of the balance entirely', async () => {
    // ⚠️ The Grow Account is a USDC account owned by the user's OWN wallet, so
    // `getTokenAccountsByOwner` returns it like any other. Counted in, the
    // spending balance absorbs the savings and every Grow makes "available" go
    // UP — measured on mainnet 2026-08-31: $669.60 spendable plus $5.27 kept
    // was displayed as "$674.86 available".
    withAccounts(owned(GROW, USDC_MINT, '5266865'), owned(SPEND, USDC_MINT, '669597865'));

    const holdings = await fetchHoldings(WALLET, new Set([GROW]));
    expect(holdings).toHaveLength(1);
    expect(holdings[0].amount).toBe(669_597_865n);
  });

  it('sums the same mint across accounts when nothing is excluded', async () => {
    withAccounts(owned(GROW, USDC_MINT, '5266865'), owned(SPEND, USDC_MINT, '669597865'));

    const holdings = await fetchHoldings(WALLET);
    expect(holdings[0].amount).toBe(674_864_730n);
  });

  it('names the single biggest account, because one transfer drains one account', async () => {
    // The sum is what a portfolio is worth; ONE account is what a transfer can
    // move. Offering the sum would ask an account for money held in another.
    withAccounts(owned(GROW, USDC_MINT, '5266865'), owned(SPEND, USDC_MINT, '669597865'));

    const holdings = await fetchHoldings(WALLET);
    expect(holdings[0].largestAccount).toEqual({ address: SPEND, amount: 669_597_865n });
  });

  it('ignores empty accounts', async () => {
    withAccounts(owned(SPEND, USDC_MINT, '0'));
    expect(await fetchHoldings(WALLET)).toHaveLength(0);
  });
});
