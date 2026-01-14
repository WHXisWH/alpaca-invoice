import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletService } from '../WalletServiceImpl';
import { AleoAddress } from '@/lib/types';
import type { WalletContextState } from '@demox-labs/aleo-wallet-adapter-react';

/**
 * WalletService 单元测试
 * 
 * 重要说明：
 * 1. Mock 对象基于真实的 WalletContextState 类型（来自 @demox-labs/aleo-wallet-adapter-react）
 * 2. 这与 useWalletController 中使用的 useWallet() 返回类型一致
 * 3. 部分扩展方法（如 requestViewKey, network）使用 (as any) 添加，因为它们可能是钱包插件的扩展功能
 * 4. 这样的 mock 更接近真实的使用场景，提高测试的准确性
 */
describe('WalletService', () => {
  let mockWallet: Partial<WalletContextState>;
  let walletService: WalletService;
  const mockAddress: AleoAddress = 'aleo1test123456789abcdefghijklmnopqrstuvwxyz' as AleoAddress;

  beforeEach(() => {
    // 创建 mock 钱包实例，基于真实的 WalletContextState 类型
    // 这与 useWallet() hook 返回的类型保持一致
    mockWallet = {
      publicKey: null,
      connected: false,
      connecting: false,
      disconnecting: false,
      wallet: null,
      wallets: [],
      autoConnect: false,
      select: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      signMessage: vi.fn().mockResolvedValue('mock_signature_123456789'),
      requestRecords: vi.fn().mockResolvedValue({ records: [] }),
      requestRecordPlaintexts: vi.fn().mockResolvedValue({ records: [] }),
    };

    walletService = new WalletService(mockWallet as any);
  });

  describe('构造函数', () => {
    it('应该成功创建 WalletService 实例', () => {
      expect(walletService).toBeInstanceOf(WalletService);
    });
  });

  describe('connect', () => {
    it('应该成功连接钱包', async () => {
      // Arrange
      mockWallet.connect = vi.fn().mockResolvedValue(undefined);

      // Act
      await walletService.connect();

      // Assert
      expect(mockWallet.connect).toHaveBeenCalledTimes(1);
    });

    it('用户拒绝连接时应该抛出友好的错误信息', async () => {
      // Arrange
      mockWallet.connect = vi.fn().mockRejectedValue(new Error('User rejected the request'));

      // Act & Assert
      await expect(walletService.connect()).rejects.toThrow('User rejected the connection request');
    });

    it('用户拒绝连接（包含 denied）时应该抛出友好的错误信息', async () => {
      // Arrange
      mockWallet.connect = vi.fn().mockRejectedValue(new Error('Request denied'));

      // Act & Assert
      await expect(walletService.connect()).rejects.toThrow('User rejected the connection request');
    });

    it('其他错误时应该抛出详细的错误信息', async () => {
      // Arrange
      mockWallet.connect = vi.fn().mockRejectedValue(new Error('Network timeout'));

      // Act & Assert
      await expect(walletService.connect()).rejects.toThrow('Failed to connect wallet');
    });
  });

  describe('disconnect', () => {
    it('应该成功断开钱包连接', async () => {
      // Arrange
      mockWallet.connected = true;

      // Act
      await walletService.disconnect();

      // Assert
      expect(mockWallet.disconnect).toHaveBeenCalledTimes(1);
    });

    it('断开连接失败时应该捕获错误并只记录日志（不抛出）', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockWallet.disconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'));

      // Act
      await walletService.disconnect();

      // Assert
      expect(mockWallet.disconnect).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to disconnect wallet:', expect.any(Error));
      
      // 清理
      consoleSpy.mockRestore();
    });
  });

  describe('getPrivateBalance', () => {
    it('应该成功获取私有余额', async () => {
      // Arrange
      const mockRecords = [
        { spent: false, data: { microcredits: '1000000' } },
        { spent: false, data: { microcredits: '2000000' } },
        { spent: true, data: { microcredits: '500000' } }, // 已花费，不计入
      ];
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

      // Act
      const balance = await walletService.getPrivateBalance(mockAddress);

      // Assert
      expect(balance).toBe(3000000n);
      expect(mockWallet.requestRecords).toHaveBeenCalledWith('credits.aleo');
    });

    it('应该过滤已花费的 Records', async () => {
      // Arrange
      const mockRecords = [
        { spent: false, data: { microcredits: '1000000' } },
        { spent: true, data: { microcredits: '5000000' } },
        { spent: false, data: { microcredits: '2000000' } },
      ];
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

      // Act
      const balance = await walletService.getPrivateBalance(mockAddress);

      // Assert - 只计算未花费的 records
      expect(balance).toBe(3000000n);
    });

    it('钱包未连接时应该抛出错误', async () => {
      // Act & Assert
      await expect(walletService.getPrivateBalance('')).rejects.toThrow('Wallet not connected');
    });

    it('钱包不支持请求 Records 时应该返回 0', async () => {
      // Arrange
      mockWallet.requestRecords = undefined;
      mockWallet.requestRecordPlaintexts = undefined;
      const serviceWithoutRecords = new WalletService(mockWallet as any);

      // Act
      const balance = await serviceWithoutRecords.getPrivateBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
    });

    it('没有 Records 时应该返回 0', async () => {
      // Arrange
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: [] });

      // Act
      const balance = await walletService.getPrivateBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
    });

    it('应该使用 requestRecordPlaintexts 作为后备方案', async () => {
      // Arrange
      mockWallet.requestRecords = undefined;
      const mockRecords = [
        { spent: false, data: { microcredits: '1500000' } },
      ];
      mockWallet.requestRecordPlaintexts = vi.fn().mockResolvedValue({ records: mockRecords });
      const serviceWithPlaintexts = new WalletService(mockWallet as any);

      // Act
      const balance = await serviceWithPlaintexts.getPrivateBalance(mockAddress);

      // Assert
      expect(balance).toBe(1500000n);
      expect(mockWallet.requestRecordPlaintexts).toHaveBeenCalledWith('credits.aleo');
    });
  });

  describe('getFeeRecords', () => {
    describe('策略1：最小满足法', () => {
      it('应该返回单个刚好满足金额的最小Record', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '3000000' } },
          { spent: false, data: { microcredits: '2000000' } }, // 最小且满足
          { spent: false, data: { microcredits: '5000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - 请求 1.5M，应该选择 2M（最小满足）
        const records = await walletService.getFeeRecords(1500000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        expect(mockWallet.requestRecords).toHaveBeenCalledWith('credits.aleo');
        
        const parsed = JSON.parse(records[0]);
        expect(parsed.data.microcredits).toBe('2000000');
      });

      it('应该返回刚好等于所需金额的Record', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '1000000' } }, // 刚好满足
          { spent: false, data: { microcredits: '2000000' } },
          { spent: false, data: { microcredits: '3000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - 请求 1M，应该选择刚好 1M 的
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        const parsed = JSON.parse(records[0]);
        expect(parsed.data.microcredits).toBe('1000000');
      });

      it('当有多个满足的Record时，应该选择最小的', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '5000000' } },
          { spent: false, data: { microcredits: '2000000' } }, // 最小满足
          { spent: false, data: { microcredits: '3000000' } },
          { spent: false, data: { microcredits: '10000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - 请求 1.5M
        const records = await walletService.getFeeRecords(1500000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        const parsed = JSON.parse(records[0]);
        expect(parsed.data.microcredits).toBe('2000000');
      });

      it('应该忽略已花费的Records', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: true, data: { microcredits: '2000000' } },  // 已花费，忽略
          { spent: false, data: { microcredits: '3000000' } }, // 应该选这个
          { spent: false, data: { microcredits: '5000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(2500000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        const parsed = JSON.parse(records[0]);
        expect(parsed.spent).toBe(false);
        expect(parsed.data.microcredits).toBe('3000000');
      });
    });

    describe('策略2：多张合并法', () => {
      it('当没有单张满足时，应该选择刚好满足金额的组合（不找零）', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '500000' } },
          { spent: false, data: { microcredits: '600000' } },
          { spent: false, data: { microcredits: '400000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - 需要 1M，没有单张满足，需要合并
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert - 应该选择 600000 + 400000 = 1000000（刚好，不找零）
        expect(records.length).toBe(2);
        const totalAmount = records
          .map(r => JSON.parse(r))
          .reduce((sum, r) => sum + BigInt(r.data.microcredits), 0n);
        expect(totalAmount).toBe(1000000n); // 刚好等于，不需要找零
        
        // 验证包含正确的组合
        const amounts = records.map(r => BigInt(JSON.parse(r).data.microcredits));
        expect(amounts).toContain(600000n);
        expect(amounts).toContain(400000n);
      });

      it('应该优先选择刚好满足的组合而不是找零的组合', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '100000' } },
          { spent: false, data: { microcredits: '200000' } },
          { spent: false, data: { microcredits: '800000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - 需要 900000
        const records = await walletService.getFeeRecords(900000n, mockAddress);

        // Assert - 应该选择 800000 + 100000 = 900000（刚好，不找零）
        expect(records.length).toBe(2);
        const totalAmount = records
          .map(r => JSON.parse(r))
          .reduce((sum, r) => sum + BigInt(r.data.microcredits), 0n);
        expect(totalAmount).toBe(900000n); // 刚好等于
        
        const amounts = records.map(r => BigInt(JSON.parse(r).data.microcredits));
        expect(amounts).toContain(800000n);
        expect(amounts).toContain(100000n);
      });

      it('应该累计多个Records直到满足所需金额', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '300000' } },
          { spent: false, data: { microcredits: '400000' } },
          { spent: false, data: { microcredits: '500000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - 需要 1M
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert - 应该选择 500000 + 400000 + 300000
        expect(records.length).toBe(3);
        const totalAmount = records
          .map(r => JSON.parse(r))
          .reduce((sum, r) => sum + BigInt(r.data.microcredits), 0n);
        expect(totalAmount).toBe(1200000n);
      });

      it('应该过滤掉已花费的Records', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: true, data: { microcredits: '5000000' } },  // 已花费，忽略
          { spent: false, data: { microcredits: '600000' } },
          { spent: false, data: { microcredits: '500000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert
        expect(records.length).toBe(2);
        records.forEach(record => {
          const parsed = JSON.parse(record);
          expect(parsed.spent).toBe(false);
        });
      });
    });

    describe('边界情况和错误处理', () => {
      it('应该正确处理 microcredits 为 0 的Records（忽略它们）', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '0' } },
          { spent: false, data: { microcredits: '600000' } },
          { spent: false, data: { microcredits: '500000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert - 应该选择 600000 + 500000 = 1100000，不应该包含金额为 0 的record
        expect(records.length).toBe(2);
        const totalAmount = records
          .map(r => JSON.parse(r))
          .reduce((sum, r) => sum + BigInt(r.data.microcredits), 0n);
        expect(totalAmount).toBe(1100000n);
        
        // 验证不包含金额为0的record
        records.forEach(record => {
          const parsed = JSON.parse(record);
          expect(BigInt(parsed.data.microcredits)).toBeGreaterThan(0n);
        });
      });

      it('当所有Records金额都为0时应该抛出错误', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '0' } },
          { spent: false, data: { microcredits: '0' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No unspent fee records available');
      });

      it('应该处理缺少 microcredits 字段的Records', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: {} }, // 缺少 microcredits
          { spent: false, data: { microcredits: '1000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(500000n, mockAddress);

        // Assert - 应该选择 1000000 的那个
        expect(records.length).toBe(1);
        const parsed = JSON.parse(records[0]);
        expect(parsed.data.microcredits).toBe('1000000');
      });

      it('余额不足时应该抛出错误', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '1000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act & Assert
        await expect(walletService.getFeeRecords(2000000n, mockAddress)).rejects.toThrow('Insufficient fee records');
      });

      it('没有可用Records时应该抛出错误', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: [] });

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No unspent fee records available');
      });

      it('所有Records都已花费时应该抛出错误', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: true, data: { microcredits: '1000000' } },
          { spent: true, data: { microcredits: '2000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No unspent fee records available');
      });

      it('钱包未连接时应该抛出错误', async () => {
        // Arrange
        mockWallet.connected = false;

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, '')).rejects.toThrow('Wallet not connected');
      });

      it('钱包没有publicKey时应该抛出错误', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = undefined;

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, '')).rejects.toThrow('Wallet not connected');
      });

      it('钱包不支持请求 Records 时应该抛出错误', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = undefined;
        mockWallet.requestRecordPlaintexts = undefined;
        const serviceWithoutRecords = new WalletService(mockWallet as any);

        // Act & Assert
        await expect(serviceWithoutRecords.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No fee records available');
      });

      it('应该在requestRecords不可用时尝试使用requestRecordPlaintexts', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = undefined;
        const mockRecords = [
          { spent: false, data: { microcredits: '2000000' } },
        ];
        mockWallet.requestRecordPlaintexts = vi.fn().mockResolvedValue({ records: mockRecords });
        const serviceWithPlaintexts = new WalletService(mockWallet as any);

        // Act
        const records = await serviceWithPlaintexts.getFeeRecords(1500000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        expect(mockWallet.requestRecordPlaintexts).toHaveBeenCalledWith('credits.aleo');
      });

      it('应该正确处理 requestRecords 返回 null 的情况', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = vi.fn().mockResolvedValue(null);

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No unspent fee records available');
      });
    });

    describe('返回格式验证', () => {
      it('应该返回字符串格式的Records', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '2000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(1500000n, mockAddress);

        // Assert
        records.forEach(record => {
          expect(typeof record).toBe('string');
        });
      });

      it('返回的Records应该可以被JSON解析', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '2000000' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(1500000n, mockAddress);

        // Assert
        records.forEach(record => {
          expect(() => JSON.parse(record)).not.toThrow();
        });
      });
    });
  });

  describe('signMessage', () => {
    it('应该成功签名消息', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const message = 'Test message to sign';
      const expectedSignature = 'signature_abcdef123456';
      mockWallet.signMessage = vi.fn().mockResolvedValue(expectedSignature);

      // Act
      const signature = await walletService.signMessage(message, mockAddress);

      // Assert
      expect(signature).toBe(expectedSignature);
      expect(mockWallet.signMessage).toHaveBeenCalledWith(message);
    });

    it('钱包未连接时应该抛出错误', async () => {
      // Arrange
      mockWallet.connected = false;

      // Act & Assert
      await expect(walletService.signMessage('test', '')).rejects.toThrow('Wallet not connected');
    });

    it('消息为空时应该抛出错误', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;

      // Act & Assert
      await expect(walletService.signMessage('', mockAddress)).rejects.toThrow('Message cannot be empty');
      await expect(walletService.signMessage('   ', mockAddress)).rejects.toThrow('Message cannot be empty');
    });

    it('钱包不支持 signMessage 时应该抛出错误', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.signMessage = undefined;
      const serviceWithoutSign = new WalletService(mockWallet as any);

      // Act & Assert
      await expect(serviceWithoutSign.signMessage('test', mockAddress)).rejects.toThrow(
        'Wallet does not support signMessage'
      );
    });

    it('返回空签名时应该抛出错误', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.signMessage = vi.fn().mockResolvedValue('');

      // Act & Assert
      await expect(walletService.signMessage('test', mockAddress)).rejects.toThrow('Signature request returned empty result');
    });

    it('用户拒绝签名时应该抛出友好的错误信息', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.signMessage = vi.fn().mockRejectedValue(new Error('User denied'));

      // Act & Assert
      await expect(walletService.signMessage('test', mockAddress)).rejects.toThrow('User rejected signature request');
    });
  });

  describe('requestTransaction', () => {
    beforeEach(() => {
      // 设置默认的 requestTransaction mock
      mockWallet.requestTransaction = vi.fn().mockResolvedValue({
        transactionId: 'mock_transaction_id_123456'
      });
    });

    it('应该成功请求交易', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const functionName = 'create_invoice';
      const inputs = ['aleo1buyer123', '1000000u64', '1735689600u32', 'hash123', 'nonce456'];
      const mockResult = { transactionId: 'at1test123456' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      const result = await walletService.requestTransaction({
        functionName,
        inputs,
        publicKey: mockAddress
      });

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockWallet.requestTransaction).toHaveBeenCalledTimes(1);
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.address).toBe(mockAddress);
      expect(callArgs.transitions[0].functionName).toBe(functionName);
      expect(callArgs.transitions[0].inputs).toEqual(inputs);
      expect(callArgs.transitions[0].program).toBe('zk_invoice.aleo');
      expect(callArgs.fee).toBe(250_000);
      expect(callArgs.feePrivate).toBe(false);
    });

    it('应该使用自定义 programId', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const customProgramId = 'credits.aleo';
      const mockResult = { transactionId: 'at1test123456' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      await walletService.requestTransaction({
        functionName: 'transfer_private',
        inputs: ['record123', 'aleo1recipient', '1000000u64'],
        publicKey: mockAddress,
        programId: customProgramId
      });

      // Assert
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.transitions[0].program).toBe(customProgramId);
    });

    it('应该使用自定义手续费金额', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const customFee = 1_000_000;
      const mockResult = { transactionId: 'at1test123456' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      await walletService.requestTransaction({
        functionName: 'create_invoice',
        inputs: ['input1'],
        publicKey: mockAddress,
        programId: 'zk_invoice.aleo',
        fee: customFee
      });

      // Assert
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.fee).toBe(customFee);
    });

    it('应该使用自定义 chainId', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const customChainId = 'mainnet';
      const mockResult = { transactionId: 'at1test123456' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      await walletService.requestTransaction({
        functionName: 'create_invoice',
        inputs: ['input1'],
        publicKey: mockAddress,
        programId: 'zk_invoice.aleo',
        fee: 250_000,
        chainId: customChainId
      });

      // Assert
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.chainId).toBe(customChainId);
    });

    it('钱包未连接时应该抛出错误', async () => {
      // Arrange
      mockWallet.connected = false;

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: ''
        })
      ).rejects.toThrow('Wallet not connected');
    });

    it('钱包不存在时应该抛出错误', async () => {
      // Arrange
      const serviceWithoutWallet = new WalletService(null as any);

      // Act & Assert
      await expect(
        serviceWithoutWallet.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Wallet not found');
    });

    it('钱包不支持 requestTransaction 时应该抛出错误', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = undefined;
      const serviceWithoutRequestTx = new WalletService(mockWallet as any);

      // Act & Assert
      await expect(
        serviceWithoutRequestTx.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Wallet does not support requestTransaction');
    });

    it('返回空结果时应该抛出错误', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Transaction request returned empty result');
    });

    it('用户拒绝交易时应该抛出友好的错误信息', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockRejectedValue(new Error('User rejected the request'));

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('User rejected the transaction request');
    });

    it('用户拒绝交易（包含 denied）时应该抛出友好的错误信息', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockRejectedValue(new Error('Request denied'));

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('User rejected the transaction request');
    });

    it('网络不匹配时应该抛出错误', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockRejectedValue(new Error('Network mismatch'));

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Wallet network does not match required network');
    });

    it('其他错误时应该抛出详细的错误信息', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockRejectedValue(new Error('Transaction failed'));

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Failed to request transaction');
    });

    it('应该正确处理包含多个输入的复杂交易', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const complexInputs = [
        'aleo1seller123',
        'aleo1buyer456',
        '1000000u64',
        '1735689600u32',
        'hash123field',
        'nonce456field'
      ];
      const mockResult = { transactionId: 'at1complex123' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      const result = await walletService.requestTransaction({
        functionName: 'create_invoice',
        inputs: complexInputs,
        publicKey: mockAddress
      });

      // Assert
      expect(result).toEqual(mockResult);
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.transitions[0].inputs).toEqual(complexInputs);
      expect(callArgs.transitions[0].inputs.length).toBe(6);
    });
  });

  describe('集成测试场景', () => {
    it('完整流程: 连接 -> 签名消息 -> 断开', async () => {
      // Arrange
      mockWallet.publicKey = null;
      mockWallet.connected = false;

      // Act - 连接
      mockWallet.publicKey = mockAddress;
      mockWallet.connected = true;
      await walletService.connect();

      // Assert - 连接
      expect(mockWallet.connected).toBe(true);

      // Act - 签名消息
      const signature = await walletService.signMessage('test message', mockAddress);
      expect(signature).toBeDefined();

      // Act - 断开
      mockWallet.connected = false;
      await walletService.disconnect();
      expect(mockWallet.connected).toBe(false);
    });

    it('应该正确计算复杂场景下的余额', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const mockRecords = [
        { spent: false, data: { microcredits: '1000000' } },
        { spent: true, data: { microcredits: '500000' } },  // 已花费，不计入
        { spent: false, data: { microcredits: '2500000' } },
        { spent: false, data: {} }, // 没有 microcredits，不计入
        { spent: false, data: { microcredits: '1500000' } },
      ];
      // 使用 requestRecords（优先级更高）
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

      // Act
      const balances = await walletService.getPrivateBalance(mockAddress);

      // Assert
      // 只计算未花费且有 microcredits 的记录: 1000000 + 2500000 + 1500000 = 5000000
      expect(balances).toBe(5000000n);
    });
  });
});

