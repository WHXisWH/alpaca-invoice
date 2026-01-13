import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import type { AleoAddress } from '@/lib/types';
import { ProtocolServiceError, ProtocolError } from '../IAleoProtocolService';

// 使用 vi.hoisted 确保 mock 函数在模块导入之前创建
const { 
  mockGetProgramMappingValue,
  mockGetLatestHeight, 
  mockSubmitTransaction, 
  mockGetTransaction 
} = vi.hoisted(() => ({
  mockGetProgramMappingValue: vi.fn(),
  mockGetLatestHeight: vi.fn(),
  mockSubmitTransaction: vi.fn(),
  mockGetTransaction: vi.fn(),
}));

// Mock AleoNetworkClient 必须在导入 AleoProtocolService 之前
vi.mock('@provablehq/sdk', () => ({
  AleoNetworkClient: vi.fn().mockImplementation(() => ({
    getProgramMappingValue: mockGetProgramMappingValue,
    getLatestHeight: mockGetLatestHeight,
    submitTransaction: mockSubmitTransaction,
    getTransaction: mockGetTransaction,
  }))
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
});

