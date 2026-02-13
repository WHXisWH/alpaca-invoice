import { AleoProtocolService } from '../AleoProtocolServiceImpl';
import { ProtocolError } from '../IAleoProtocolService';
import { PROGRAM_ID } from '@/lib/contract';

vi.mock('@provablehq/sdk', () => {
  const mockClient = {
    getProgram: vi.fn().mockResolvedValue('program source'),
    getLatestHeight: vi.fn().mockResolvedValue(10),
    getProgramMappingValue: vi.fn().mockResolvedValue('0u8'),
    submitTransaction: vi.fn().mockResolvedValue('at1tx'),
    getTransaction: vi.fn().mockResolvedValue({
      transitions: [{ program: PROGRAM_ID, function: 'foo', outputs: [1, 2] }]
    })
  };
  const mockPM = {
    run: vi.fn().mockResolvedValue({ outputs: ['999field'] }),
    buildAuthorization: vi.fn().mockResolvedValue({})
  };
  return {
    AleoNetworkClient: vi.fn(() => mockClient),
    ProgramManager: vi.fn(() => mockPM)
  };
});

describe('AleoProtocolService', () => {
  const svc = new AleoProtocolService();

  test('computeInvoiceIdOffline returns field', async () => {
    const res = await svc.computeInvoiceIdOffline({
      seller: 'aleo1seller',
      buyer: 'aleo1buyer',
      amount: 1n,
      dueDate: 123,
      nonce: '1field'
    });
    expect(res).toBe('999field');
  });

  test('getInvoiceStatus parses u8 and caches', async () => {
    const first = await svc.getInvoiceStatus('abcfield');
    expect(first).toBe(0);
    const second = await svc.getInvoiceStatus('abcfield');
    expect(second).toBe(first);
  });

  test('getInvoiceHash null when missing', async () => {
    // Override mock to return null
    const sdk = await import('@provablehq/sdk');
    (sdk.AleoNetworkClient as any).mock.results[0].value.getProgramMappingValue.mockResolvedValueOnce(null);
    const res = await svc.getInvoiceHash('missing');
    expect(res).toBeNull();
  });

  test('verifyInvoiceOnChain returns exists/hashMatch/status', async () => {
    const res = await svc.verifyInvoiceOnChain('abcfield', '123u8field' as any);
    expect(res.exists).toBe(true);
    expect(res.chainStatus).toBe(0);
  });

  test('getAuditCounter parses u64', async () => {
    const sdk = await import('@provablehq/sdk');
    (sdk.AleoNetworkClient as any).mock.results[0].value.getProgramMappingValue.mockResolvedValueOnce('5u64');
    const res = await svc.getAuditCounter('aleo1seller');
    expect(res).toBe(5);
  });

  test('assertRules calls run', async () => {
    const sdk = await import('@provablehq/sdk');
    const pm = (sdk.ProgramManager as any).mock.results[0].value;
    await svc.assertRules('inv', 'hash');
    expect(pm.run).toHaveBeenCalledWith(expect.any(String), 'assert_rules_anchor', ['inv', 'hash'], false);
  });

  test('getLatestBlockHeight throws on invalid', async () => {
    const sdk = await import('@provablehq/sdk');
    (sdk.AleoNetworkClient as any).mock.results[0].value.getLatestHeight.mockResolvedValueOnce(-1);
    await expect(svc.getLatestBlockHeight()).rejects.toHaveProperty('code', ProtocolError.NODE_CONNECTION_FAILED);
  });
});

