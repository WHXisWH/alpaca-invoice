import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AleoProtocolService } from '../AleoProtocolServiceImpl';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import type { AleoAddress } from '@/lib/types';
import { ProtocolServiceError, ProtocolError } from '../IAleoProtocolService';

describe('AleoProtocolService', () => {
  let service: AleoProtocolService;
  const mockAddress = 'aleo1test123456789' as AleoAddress;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new AleoProtocolService(WalletAdapterNetwork.TestnetBeta);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getPublicBalance', () => {
    it('应该成功获取公开余额', async () => {
      // Arrange
      const mockBalance = '5000000u64';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockBalance
      } as Response);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(5000000n);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/program/credits.aleo/mapping/account/${mockAddress}`),
        {
          method: 'get',
          headers: {
            'Accept': 'application/json'
          }
        }
      );
    });

    it('应该处理没有 u64 后缀的余额', async () => {
      // Arrange
      const mockBalance = '3000000';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockBalance
      } as Response);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(3000000n);
    });

    it('应该处理带引号的响应（如 "60000000u64"）', async () => {
      // Arrange
      const mockBalance = '"60000000u64"';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockBalance
      } as Response);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(60000000n);
    });

    it('应该处理带单引号的响应', async () => {
      // Arrange
      const mockBalance = "'5000000u64'";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockBalance
      } as Response);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(5000000n);
    });

    it('当地址没有公开余额时应该返回 0（404 响应）', async () => {
      // Arrange
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
    });

    it('当余额为空字符串时应该返回 0', async () => {
      // Arrange
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => ''
      } as Response);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
    });

    it('当网络错误时应该返回 0 并打印警告', async () => {
      // Arrange
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('应该处理大额余额', async () => {
      // Arrange
      const mockBalance = '999999999999999u64';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockBalance
      } as Response);

      // Act
      const balance = await service.getPublicBalance(mockAddress);

      // Assert
      expect(balance).toBe(999999999999999n);
    });
  });

  describe('getLatestBlockHeight', () => {
    it('应该成功获取最新区块高度', async () => {
      // Arrange
      const mockHeight = 12345;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockHeight
      } as Response);

      // Act
      const height = await service.getLatestBlockHeight();

      // Assert
      expect(height).toBe(12345);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/latest/height')
      );
    });

    it('网络连接失败时应该抛出错误', async () => {
      // Arrange
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Service Unavailable'
      } as Response);

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

