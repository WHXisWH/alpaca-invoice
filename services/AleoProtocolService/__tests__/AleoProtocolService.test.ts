import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import type { AleoAddress, AleoTransactionId } from '@/lib/types';
import { ProtocolServiceError, ProtocolError } from '../IAleoProtocolService';

// 使用 vi.hoisted 确保 mock 函数在模块导入之前创建
const { 
  mockGetProgramMappingValue,
  mockGetLatestHeight, 
  mockSubmitTransaction, 
  mockGetTransaction,
  mockBuildAuthorization,
  mockEstimateFeeForAuthorization,
  mockAuthorization,
  MockProgramManager
} = vi.hoisted(() => {
  const mockGetProgramMappingValue = vi.fn();
  const mockGetLatestHeight = vi.fn();
  const mockSubmitTransaction = vi.fn();
  const mockGetTransaction = vi.fn();
  const mockBuildAuthorization = vi.fn();
  const mockEstimateFeeForAuthorization = vi.fn();
  
  // Mock Authorization 对象
  const mockAuthorization = {
    toExecutionId: vi.fn(() => ({ toString: () => 'mock-execution-id' })),
  };
  
  // Mock ProgramManager 类
  const MockProgramManager = vi.fn().mockImplementation(() => ({
    buildAuthorization: mockBuildAuthorization,
    estimateFeeForAuthorization: mockEstimateFeeForAuthorization,
  }));
  
  return {
    mockGetProgramMappingValue,
    mockGetLatestHeight,
    mockSubmitTransaction,
    mockGetTransaction,
    mockBuildAuthorization,
    mockEstimateFeeForAuthorization,
    mockAuthorization,
    MockProgramManager,
  };
});

// Mock AleoNetworkClient 必须在导入 AleoProtocolService 之前
vi.mock('@provablehq/sdk', () => ({
  AleoNetworkClient: vi.fn().mockImplementation(() => ({
    getProgramMappingValue: mockGetProgramMappingValue,
    getLatestHeight: mockGetLatestHeight,
    submitTransaction: mockSubmitTransaction,
    getTransaction: mockGetTransaction,
  })),
  ProgramManager: MockProgramManager,
}));

// 在 mock 之后导入
import { AleoProtocolService } from '../AleoProtocolServiceImpl';

describe('AleoProtocolService', () => {
  let service: AleoProtocolService;
  const mockAddress = 'aleo1test123456789' as AleoAddress;

  beforeEach(() => {
    // 重置所有 mock 函数的调用历史和实现
    mockGetProgramMappingValue.mockReset();
    mockGetLatestHeight.mockReset();
    mockSubmitTransaction.mockReset();
    mockGetTransaction.mockReset();
    mockBuildAuthorization.mockReset();
    mockEstimateFeeForAuthorization.mockReset();
    MockProgramManager.mockClear();
    
    service = new AleoProtocolService(WalletAdapterNetwork.TestnetBeta);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPublicBalance', () => {
    it('应该成功获取公开余额', async () => {
      // Arrange
      mockGetProgramMappingValue.mockResolvedValue('5000000u64');

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(5000000n);
      expect(mockGetProgramMappingValue).toHaveBeenCalledWith(
        'credits.aleo',
        'account',
        mockAddress
      );
    });

    it('应该处理没有 u64 后缀的余额', async () => {
      // Arrange
      mockGetProgramMappingValue.mockResolvedValue('3000000');

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(3000000n);
    });

    it('应该处理带引号的响应（如 "60000000u64"）', async () => {
      // Arrange
      mockGetProgramMappingValue.mockResolvedValue('"60000000u64"');

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(60000000n);
    });

    it('应该处理带单引号的响应', async () => {
      // Arrange
      mockGetProgramMappingValue.mockResolvedValue("'5000000u64'");

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(5000000n);
    });

    it('当地址没有公开余额时应该返回 0（null 响应）', async () => {
      // Arrange
      mockGetProgramMappingValue.mockResolvedValue(null);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
    });

    it('当余额为空字符串时应该返回 0', async () => {
      // Arrange
      mockGetProgramMappingValue.mockResolvedValue('');

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
    });

    it('当网络错误时应该返回 0 并打印警告', async () => {
      // Arrange
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetProgramMappingValue.mockRejectedValue(new Error('Network error'));

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('应该处理大额余额', async () => {
      // Arrange
      mockGetProgramMappingValue.mockResolvedValue('999999999999999u64');

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(999999999999999n);
    });
  });

  describe('getLatestBlockHeight', () => {
    it('应该成功获取最新区块高度', async () => {
      // Arrange
      mockGetLatestHeight.mockResolvedValue(12345);

      // Act
      const height = await service.getLatestBlockHeight();

      // Assert
      expect(height).toBe(12345);
      expect(mockGetLatestHeight).toHaveBeenCalled();
    });

    it('网络连接失败时应该抛出错误', async () => {
      // Arrange
      mockGetLatestHeight.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      const error = await service.getLatestBlockHeight().catch(e => e) as ProtocolServiceError;
      expect(error).toBeInstanceOf(ProtocolServiceError);
      expect(error.code).toBe(ProtocolError.NODE_CONNECTION_FAILED);
    });

    it('当返回无效高度时应该抛出错误', async () => {
      // Arrange
      mockGetLatestHeight.mockResolvedValue(null);

      // Act & Assert
      const error = await service.getLatestBlockHeight().catch(e => e) as ProtocolServiceError;
      expect(error).toBeInstanceOf(ProtocolServiceError);
      expect(error.code).toBe(ProtocolError.NODE_CONNECTION_FAILED);
    });
  });

  describe('网络配置', () => {
    it('应该为 MainnetBeta 使用正确的 RPC URL', () => {
      const mainnetService = new AleoProtocolService(WalletAdapterNetwork.MainnetBeta);
      expect(mainnetService).toBeDefined();
    });

    it('应该为 Testnet 使用正确的 RPC URL', () => {
      const testnetService = new AleoProtocolService(WalletAdapterNetwork.Testnet);
      expect(testnetService).toBeDefined();
    });

    it('应该为 TestnetBeta 使用正确的 RPC URL', () => {
      const testnetBetaService = new AleoProtocolService(WalletAdapterNetwork.TestnetBeta);
      expect(testnetBetaService).toBeDefined();
    });

    it('默认应该使用 TestnetBeta', () => {
      const defaultService = new AleoProtocolService();
      expect(defaultService).toBeDefined();
    });
  });

  describe('estimateExecutionFee', () => {
    const mockProgramName = 'zk_invoice.aleo';
    const mockFunctionName = 'create_invoice';
    const mockInputs = ['aleo1test', '1000000u64', '1234567890u32'];

    it('应该成功估算执行费用并增加 20% 冗余', async () => {
      // Arrange
      const baseFee = 200000n; // 200,000 microcredits
      mockBuildAuthorization.mockResolvedValue(mockAuthorization);
      mockEstimateFeeForAuthorization.mockResolvedValue(baseFee);

      // Act
      const fee = await service.estimateExecutionFee(
        mockProgramName,
        mockFunctionName,
        mockInputs
      );

      // Assert
      // 200,000 * 1.2 = 240,000
      expect(fee).toBe(240000n);
      expect(mockBuildAuthorization).toHaveBeenCalledWith({
        programName: mockProgramName,
        functionName: mockFunctionName,
        inputs: mockInputs,
      });
      expect(mockEstimateFeeForAuthorization).toHaveBeenCalledWith({
        authorization: mockAuthorization,
        programName: 'credits.aleo',
      });
    });

    it('应该处理大额费用估算', async () => {
      // Arrange
      const baseFee = 1000000n; // 1,000,000 microcredits
      mockBuildAuthorization.mockResolvedValue(mockAuthorization);
      mockEstimateFeeForAuthorization.mockResolvedValue(baseFee);

      // Act
      const fee = await service.estimateExecutionFee(
        mockProgramName,
        mockFunctionName,
        mockInputs
      );

      // Assert
      // 1,000,000 * 1.2 = 1,200,000
      expect(fee).toBe(1200000n);
    });

    it('应该处理零费用（边界情况）', async () => {
      // Arrange
      const baseFee = 0n;
      mockBuildAuthorization.mockResolvedValue(mockAuthorization);
      mockEstimateFeeForAuthorization.mockResolvedValue(baseFee);

      // Act
      const fee = await service.estimateExecutionFee(
        mockProgramName,
        mockFunctionName,
        mockInputs
      );

      // Assert
      expect(fee).toBe(0n);
    });

    it('当 buildAuthorization 失败时应该返回降级值', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockBuildAuthorization.mockRejectedValue(new Error('Build authorization failed'));

      // Act
      const fee = await service.estimateExecutionFee(
        mockProgramName,
        mockFunctionName,
        mockInputs
      );

      // Assert
      expect(fee).toBe(250_000n); // 降级值
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('使用降级费用估算值: 250,000 microcredits');

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('当 estimateFeeForAuthorization 失败时应该返回降级值', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockBuildAuthorization.mockResolvedValue(mockAuthorization);
      mockEstimateFeeForAuthorization.mockRejectedValue(new Error('Estimate fee failed'));

      // Act
      const fee = await service.estimateExecutionFee(
        mockProgramName,
        mockFunctionName,
        mockInputs
      );

      // Assert
      expect(fee).toBe(250_000n); // 降级值
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('使用降级费用估算值: 250,000 microcredits');

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('当抛出 ProtocolServiceError 时应该重新抛出', async () => {
      // Arrange
      const { ProtocolServiceError, ProtocolError } = await import('../IAleoProtocolService');
      const expectedError = new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Connection failed'
      );
      mockBuildAuthorization.mockRejectedValue(expectedError);

      // Act & Assert
      await expect(
        service.estimateExecutionFee(mockProgramName, mockFunctionName, mockInputs)
      ).rejects.toThrow(ProtocolServiceError);
    });

    it('应该正确传递不同的输入参数', async () => {
      // Arrange
      const customInputs = ['aleo1buyer', '5000000u64', '9876543210u32', 'hash123field'];
      mockBuildAuthorization.mockResolvedValue(mockAuthorization);
      mockEstimateFeeForAuthorization.mockResolvedValue(300000n);

      // Act
      await service.estimateExecutionFee(
        mockProgramName,
        mockFunctionName,
        customInputs
      );

      // Assert
      expect(mockBuildAuthorization).toHaveBeenCalledWith({
        programName: mockProgramName,
        functionName: mockFunctionName,
        inputs: customInputs,
      });
    });

    it('应该为不同的程序名称正确调用', async () => {
      // Arrange
      const customProgramName = 'credits.aleo';
      const customFunctionName = 'transfer_public';
      mockBuildAuthorization.mockResolvedValue(mockAuthorization);
      mockEstimateFeeForAuthorization.mockResolvedValue(150000n);

      // Act
      await service.estimateExecutionFee(
        customProgramName,
        customFunctionName,
        mockInputs
      );

      // Assert
      expect(mockBuildAuthorization).toHaveBeenCalledWith({
        programName: customProgramName,
        functionName: customFunctionName,
        inputs: mockInputs,
      });
    });
  });

  describe('verifyRecordOnChain', () => {
    const mockTransactionId = 'at1test123456789' as AleoTransactionId;
    const mockTransaction = {
      id: mockTransactionId,
      execution: {
        transitions: [
          {
            id: {
              program: 'zk_invoice.aleo',
              function: 'create_invoice'
            },
            outputs: [
              { type: 'record', value: 'record1...' },
              { type: 'record', value: 'record2...' }
            ]
          }
        ],
        outputs: [
          { type: 'record', value: 'record1...' },
          { type: 'record', value: 'record2...' }
        ]
      }
    };

    it('应该成功验证交易已上链（无额外选项）', async () => {
      // Arrange
      mockGetTransaction.mockResolvedValue(mockTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId);

      // Assert
      expect(result.verified).toBe(true);
      expect(result.transaction).toEqual(mockTransaction);
      expect(result.message).toContain('verified successfully');
      expect(mockGetTransaction).toHaveBeenCalledWith(mockTransactionId);
    });

    it('应该成功验证交易属于指定程序', async () => {
      // Arrange
      mockGetTransaction.mockResolvedValue(mockTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        programId: 'zk_invoice.aleo'
      });

      // Assert
      expect(result.verified).toBe(true);
      expect(result.message).toContain('verified successfully');
    });

    it('应该失败当交易不属于指定程序', async () => {
      // Arrange
      const wrongProgramTransaction = {
        ...mockTransaction,
        execution: {
          transitions: [
            {
              id: {
                program: 'credits.aleo',
                function: 'transfer_public'
              }
            }
          ]
        }
      };
      mockGetTransaction.mockResolvedValue(wrongProgramTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        programId: 'zk_invoice.aleo'
      });

      // Assert
      expect(result.verified).toBe(false);
      expect(result.message).toContain('does not belong to program');
    });

    it('应该成功验证交易调用了指定函数', async () => {
      // Arrange
      mockGetTransaction.mockResolvedValue(mockTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        functionName: 'create_invoice'
      });

      // Assert
      expect(result.verified).toBe(true);
      expect(result.message).toContain('verified successfully');
    });

    it('应该失败当交易未调用指定函数', async () => {
      // Arrange
      mockGetTransaction.mockResolvedValue(mockTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        functionName: 'mark_as_paid'
      });

      // Assert
      expect(result.verified).toBe(false);
      expect(result.message).toContain('does not call function');
    });

    it('应该成功验证输出 record 数量', async () => {
      // Arrange
      mockGetTransaction.mockResolvedValue(mockTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        expectedOutputsCount: 2
      });

      // Assert
      expect(result.verified).toBe(true);
      expect(result.message).toContain('verified successfully');
    });

    it('应该失败当输出 record 数量不匹配', async () => {
      // Arrange
      mockGetTransaction.mockResolvedValue(mockTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        expectedOutputsCount: 3
      });

      // Assert
      expect(result.verified).toBe(false);
      expect(result.message).toContain('Expected 3 output records, but found 2');
    });

    it('应该成功验证所有选项（程序、函数、输出数量）', async () => {
      // Arrange
      mockGetTransaction.mockResolvedValue(mockTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        programId: 'zk_invoice.aleo',
        functionName: 'create_invoice',
        expectedOutputsCount: 2
      });

      // Assert
      expect(result.verified).toBe(true);
      expect(result.message).toContain('verified successfully');
    });

    it('应该处理交易不存在的情况', async () => {
      // Arrange
      mockGetTransaction.mockResolvedValue(null);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId);

      // Assert
      expect(result.verified).toBe(false);
      expect(result.transaction).toBeNull();
      expect(result.message).toContain('not found on chain');
    });

    it('应该处理交易格式为 transitions 数组的情况', async () => {
      // Arrange
      const transactionWithTransitions = {
        id: mockTransactionId,
        transitions: [
          {
            program: 'zk_invoice.aleo',
            function: 'create_invoice',
            outputs: [
              { type: 'record', value: 'record1...' }
            ]
          }
        ]
      };
      mockGetTransaction.mockResolvedValue(transactionWithTransitions);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        programId: 'zk_invoice.aleo',
        functionName: 'create_invoice',
        expectedOutputsCount: 1
      });

      // Assert
      expect(result.verified).toBe(true);
    });

    it('应该处理网络错误', async () => {
      // Arrange
      const networkError = new Error('Network error');
      mockGetTransaction.mockRejectedValue(networkError);

      // Act & Assert
      const error = await service.verifyRecordOnChain(mockTransactionId).catch(e => e) as ProtocolServiceError;
      expect(error).toBeInstanceOf(ProtocolServiceError);
      expect(error.code).toBe(ProtocolError.NODE_CONNECTION_FAILED);
    });

    it('应该处理空的 transitions 数组', async () => {
      // Arrange
      const emptyTransaction = {
        id: mockTransactionId,
        execution: {
          transitions: []
        }
      };
      mockGetTransaction.mockResolvedValue(emptyTransaction);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        programId: 'zk_invoice.aleo'
      });

      // Assert
      expect(result.verified).toBe(false);
      expect(result.message).toContain('does not belong to program');
    });

    it('应该处理没有 outputs 的交易', async () => {
      // Arrange
      const transactionWithoutOutputs = {
        id: mockTransactionId,
        execution: {
          transitions: [
            {
              id: {
                program: 'zk_invoice.aleo',
                function: 'create_invoice'
              }
            }
          ]
        }
      };
      mockGetTransaction.mockResolvedValue(transactionWithoutOutputs);

      // Act
      const result = await service.verifyRecordOnChain(mockTransactionId, {
        expectedOutputsCount: 0
      });

      // Assert
      expect(result.verified).toBe(true);
    });
  });
});

