import { DFlowRequestError } from '../../dflow/types';
import { humanTransactionError } from '../failure';

/** The real thing: web3.js puts the whole simulation dump in `.message`. */
const SIMULATION_DUMP = `Simulation failed.
Message: Transaction simulation failed: Error processing Instruction 2: Program failed to complete.
Logs:
[
  "Program data: yvLkHCXCNCIBAADXQw8AAAAALZCDwAAAAAyVT5SH43cMeB/ePdmQPn8BF0URnKQ+RzOAdrelIJZbQ=",
  "Program jupZ4m2GqUCJ5iueMfzQf8khFfH31d4XAQt3RzCT9Vd consumed 139654 of 145701 compute units",
  "Program DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH consumed 199700 of 199700 compute units",
  "Program DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH failed: exceeded CUs meter at BPF instruction"
]`;

describe('humanTransactionError', () => {
  it('never returns the simulation dump', () => {
    const message = humanTransactionError(new Error(SIMULATION_DUMP));
    expect(message).not.toContain('Program data');
    expect(message).not.toContain('compute units');
    expect(message.split('\n')).toHaveLength(1);
  });

  it('names the compute budget failure as something the user can act on', () => {
    expect(humanTransactionError(new Error(SIMULATION_DUMP))).toBe(
      'That route was too long to fit in one transaction. Nothing was spent. Try another asset.',
    );
  });

  it('does not call a cancelled wallet dialog a failure', () => {
    expect(humanTransactionError(new Error('User rejected the request.'))).toBe(
      'You cancelled that in your wallet. Nothing happened.',
    );
  });

  it('reads slippage as a price move, not an error code', () => {
    const raw = new Error('custom program error: 0x3a99 (SlippageLimitExceeded)');
    expect(humanTransactionError(raw)).toMatch(/price moved/);
  });

  it('leaves DFlow to answer for itself', () => {
    // The client already turns this code into a sentence worth more than any
    // generic fallback here.
    const dflow = new DFlowRequestError({ msg: 'no route', code: 'route_not_found' });
    expect(humanTransactionError(dflow)).toBe(
      'No route for that amount right now. Try a slightly larger amount.',
    );
  });

  it('does not claim nothing was spent when nothing was attempted', () => {
    expect(humanTransactionError(new TypeError('Failed to fetch'))).toBe(
      'Grow could not reach the network. Try again.',
    );
  });

  it('falls back to one sentence for anything unrecognised', () => {
    expect(humanTransactionError({ weird: true })).toBe(
      'That Grow did not go through. Nothing was spent.',
    );
  });
});
