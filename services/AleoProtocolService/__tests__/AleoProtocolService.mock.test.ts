import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AleoProtocolService } from '../AleoProtocolServiceImpl';

vi.mock('@provablehq/sdk', () => {
  const run = vi.fn(async (_program: string, fn: string, inputs: string[]) => {
    return { outputs: fn === 'compute_invoice_id' ? ['123field'] : ['456field'] };
  });
  const getProgram = vi.fn(async () => 'program text');
  return {
    AleoNetworkClient: vi.fn().mockImplementation(() => ({
      getProgram,
      getProgramMappingValue: vi.fn(async () => null)
    })),
    ProgramManager: vi.fn().mockImplementation(() => ({
      run
    }))
  };
});

describe('AleoProtocolService (mocked)', () => {
  let svc: AleoProtocolService;

  beforeEach(() => {
    svc = new AleoProtocolService();
  });

  it('computeInvoiceIdOffline returns id', async () => {
    const id = await svc.computeInvoiceIdOffline({
      seller: 'aleo1seller' as any,
      buyer: 'aleo1buyer' as any,
      amount: 1n,
      dueDate: 1,
      nonce: '0field'
    });
    expect(id).toBe('123field');
  });

  it('computeInvoiceHashOffline returns hash', async () => {
    const hash = await svc.computeInvoiceHashOffline({
      seller: 'aleo1seller' as any,
      buyer: 'aleo1buyer' as any,
      amount: 1n,
      taxAmount: 1n,
      dueDate: 1,
      nonce: '0field',
      orderId: '0field',
      currency: '0field',
      itemsHash: '0field',
      memoHash: '0field'
    });
    expect(hash).toBe('456field');
  });
});
