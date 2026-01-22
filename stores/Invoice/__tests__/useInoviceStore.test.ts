import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { Invoice, InvoiceStatus, InvoiceDetails } from '@/lib/types';

// Mock 服务（需要在导入 store 之前，使用 vi.hoisted 确保提升）
const { mockStorageService, mockCryptoService } = vi.hoisted(() => {
  const mockStorageService = {
    addData: vi.fn().mockResolvedValue(undefined),
    getData: vi.fn().mockResolvedValue(undefined),
    getAllData: vi.fn().mockResolvedValue([]),
    updateData: vi.fn().mockResolvedValue(undefined)
  };

  const mockCryptoService = {
    encryptInvoiceDetails: vi.fn().mockResolvedValue({ iv: 'test-iv', ciphertext: 'encrypted-data' }),
    decryptInvoiceDetails: vi.fn().mockResolvedValue({
      invoiceNumber: 'INV-001',
      lineItems: [{ description: 'Item 1', quantity: 2, unitPrice: 100, amount: 200 }],
      subtotal: 200,
      taxRate: 0.1,
      taxAmount: 20,
      total: 220,
      currency: 'USD'
    })
  };

  return { mockStorageService, mockCryptoService };
});

vi.mock('@/services/StorageService/StorageServiceImpl', () => ({
  StorageService: vi.fn().mockImplementation(() => mockStorageService)
}));

vi.mock('@/services/CryptoService/CryptoServiceImpl', () => ({
  CryptoService: vi.fn().mockImplementation(() => mockCryptoService)
}));

// 在 mock 之后导入 store
import { useInvoiceStore } from '../useInoviceStore';

describe('useInvoiceStore', () => {
  const masterKey = 'test-master-key';
  const INVOICE_TABLE = 'invoices';

  // 测试数据
  const mockInvoiceDetails: InvoiceDetails = {
    invoiceNumber: 'INV-001',
    lineItems: [
      { description: 'Item 1', quantity: 2, unitPrice: 100, amount: 200 }
    ],
    subtotal: 200,
    taxRate: 0.1,
    taxAmount: 20,
    total: 220,
    currency: 'USD',
    notes: 'Test invoice'
  };

  const mockInvoice: Invoice = {
    id: '1field' as any,
    invoiceHash: 'hash1field' as any,
    seller: 'aleo1seller123' as any,
    buyer: 'aleo1buyer456' as any,
    amount: BigInt('1000000'),
    dueDate: new Date('2024-12-31'),
    createdAt: new Date('2024-01-01'),
    status: InvoiceStatus.PENDING,
    details: mockInvoiceDetails
  };

  const mockEncryptedDetails = {
    iv: 'test-iv',
    ciphertext: 'encrypted-data'
  };

  beforeEach(() => {
    // 重置 store 状态（包括 currentInvoice）
    useInvoiceStore.setState({ invoices: [], currentInvoice: null });

    // 重置所有 mock
    vi.clearAllMocks();
    
    // 重置 mock 返回值
    mockStorageService.addData.mockResolvedValue(undefined);
    mockStorageService.getData.mockResolvedValue(undefined);
    mockStorageService.getAllData.mockResolvedValue([]);
    mockStorageService.updateData.mockResolvedValue(undefined);
    mockCryptoService.encryptInvoiceDetails.mockResolvedValue(mockEncryptedDetails);
    mockCryptoService.decryptInvoiceDetails.mockResolvedValue(mockInvoiceDetails);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addInvoice', () => {
    it('应该成功添加发票到内存和IndexedDB', async () => {
      const store = useInvoiceStore.getState();

      await store.addInvoice(mockInvoice, { masterKey, persistFull: true });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);
      // ✅ 验证 invoice 的基本字段
      expect(state.invoices[0].id).toBe(mockInvoice.id);
      expect(state.invoices[0].invoiceHash).toBe(mockInvoice.invoiceHash);
      expect(state.invoices[0].seller).toBe(mockInvoice.seller);
      expect(state.invoices[0].buyer).toBe(mockInvoice.buyer);
      expect(state.invoices[0].amount).toBe(mockInvoice.amount);
      expect(state.invoices[0].status).toBe(mockInvoice.status);
      expect(state.invoices[0].details).toEqual(mockInvoice.details);
      // ✅ 验证自动添加的 metadata
      expect(state.invoices[0].metadata).toBeDefined();
      expect(state.invoices[0].metadata?.confirmationStatus).toBe('SENDING');
      expect(state.invoices[0].metadata?.dataSource).toBe('local');
      expect(state.invoices[0].metadata?.lastUpdated).toBeInstanceOf(Date);

      // 验证加密服务调用
      expect(mockCryptoService.encryptInvoiceDetails).toHaveBeenCalledWith(
        mockInvoiceDetails,
        masterKey
      );

      // 验证存储服务调用
      expect(mockStorageService.addData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        mockInvoice.id,
        expect.objectContaining({
          id: mockInvoice.id,
          invoiceHash: mockInvoice.invoiceHash,
          seller: mockInvoice.seller,
          buyer: mockInvoice.buyer,
          amount: mockInvoice.amount,
          encryptedDetails: mockEncryptedDetails,
          metadata: expect.objectContaining({
            confirmationStatus: 'SENDING',
            dataSource: 'local'
          })
        })
      );
    });

    it('应该在没有masterKey 时只更新内存', async () => {
      const store = useInvoiceStore.getState();

      await store.addInvoice(mockInvoice, { persistFull: true });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);

      // 验证没有调用存储服务
      expect(mockStorageService.addData).not.toHaveBeenCalled();
      expect(mockCryptoService.encryptInvoiceDetails).not.toHaveBeenCalled();
    });

    it('应该在 persistFull 为 false 时只更新内存', async () => {
      const store = useInvoiceStore.getState();

      await store.addInvoice(mockInvoice, { masterKey, persistFull: false });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);

      // 验证没有调用存储服务
      expect(mockStorageService.addData).not.toHaveBeenCalled();
    });

    it('应该处理没有 details 的发票', async () => {
      const invoiceWithoutDetails = { ...mockInvoice, details: undefined };
      const store = useInvoiceStore.getState();

      await store.addInvoice(invoiceWithoutDetails, { masterKey, persistFull: true });

      // 验证存储时 encryptedDetails 为 null
      expect(mockStorageService.addData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        invoiceWithoutDetails.id,
        expect.objectContaining({
          encryptedDetails: null
        })
      );
    });

    it('应该在存储失败时抛出错误且不更新内存（保持数据库和内存同步）', async () => {
      const store = useInvoiceStore.getState();
      const error = new Error('Storage failed');
      mockStorageService.addData.mockRejectedValue(error);

      await expect(
        store.addInvoice(mockInvoice, { masterKey, persistFull: true })
      ).rejects.toThrow('Storage failed');

      // 验证内存状态未更新（保持数据库和内存同步）
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(0);
    });
  });

  describe('updateInvoice', () => {
    beforeEach(() => {
      // 先添加一个发票到内存（包含 metadata）
      const invoiceWithMetadata = {
        ...mockInvoice,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date('2024-01-01'),
          dataSource: 'local' as const
        }
      };
      useInvoiceStore.setState({ invoices: [invoiceWithMetadata] });
    });

    it('应该成功更新发票', async () => {
      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      const updates = { status: InvoiceStatus.PAID };
      await store.updateInvoice(mockInvoice.id, updates, { masterKey, persistFull: true });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PAID);

      // 验证存储服务调用
      expect(mockStorageService.getData).toHaveBeenCalledWith(INVOICE_TABLE, mockInvoice.id);
      expect(mockStorageService.updateData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        mockInvoice.id,
        expect.objectContaining({
          status: InvoiceStatus.PAID
        })
      );
    });

    it('应该在发票不存在时返回', async () => {
      const store = useInvoiceStore.getState();
      const nonExistentId = '999field' as any;

      await store.updateInvoice(nonExistentId, { status: InvoiceStatus.PAID }, { masterKey });

      // 验证没有调用存储服务
      expect(mockStorageService.getData).not.toHaveBeenCalled();
      expect(mockStorageService.updateData).not.toHaveBeenCalled();
    });

    it('应该在 IndexedDB 中找不到发票时返回', async () => {
      const store = useInvoiceStore.getState();
      mockStorageService.getData.mockResolvedValue(undefined);

      await store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { masterKey, persistFull: true });

      // 验证没有调用 updateData
      expect(mockStorageService.updateData).not.toHaveBeenCalled();
    });

    it('应该更新 details 时重新加密', async () => {
      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      const newDetails: InvoiceDetails = {
        ...mockInvoiceDetails,
        invoiceNumber: 'INV-002'
      };

      await store.updateInvoice(mockInvoice.id, { details: newDetails }, { masterKey, persistFull: true });

      // 验证重新加密
      expect(mockCryptoService.encryptInvoiceDetails).toHaveBeenCalledWith(newDetails, masterKey);
    });

    it('应该在没有 masterKey 时只更新内存', async () => {
      const store = useInvoiceStore.getState();

      await store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { persistFull: true });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PAID);

      // 验证没有调用存储服务
      expect(mockStorageService.getData).not.toHaveBeenCalled();
    });

    it('应该在存储失败时抛出错误且不更新内存（保持数据库和内存同步）', async () => {
      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);
      const error = new Error('Storage update failed');
      mockStorageService.updateData.mockRejectedValue(error);

      await expect(
        store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { masterKey, persistFull: true })
      ).rejects.toThrow('Storage update failed');

      // 验证内存状态未更新（保持数据库和内存同步）
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PENDING); // 保持原状态
    });

    it('应该优先使用 currentInvoice 而不是 invoices 中的数据', async () => {
      // 设置 currentInvoice 和 invoices 中的数据不一致
      const currentInvoiceWithMetadata = {
        ...mockInvoice,
        status: InvoiceStatus.CANCELLED, // currentInvoice 中的状态是 CANCELLED
        metadata: {
          confirmationStatus: 'CONFIRMED' as const,
          lastUpdated: new Date('2024-01-02'),
          dataSource: 'chain' as const
        }
      };
      
      const invoiceInList = {
        ...mockInvoice,
        status: InvoiceStatus.PENDING, // invoices 中的状态是 PENDING
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date('2024-01-01'),
          dataSource: 'local' as const
        }
      };

      useInvoiceStore.setState({
        invoices: [invoiceInList],
        currentInvoice: currentInvoiceWithMetadata
      });

      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: InvoiceStatus.CANCELLED, // IndexedDB 中的状态
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'CONFIRMED' as const,
          lastUpdated: new Date('2024-01-02'),
          dataSource: 'chain' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      // 更新 status 为 PAID
      await store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { masterKey, persistFull: true });

      // 验证更新后的 invoice 是基于 currentInvoice 的（应该包含 currentInvoice 的 metadata）
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PAID);
      expect(state.invoices[0].metadata).toEqual({
        confirmationStatus: 'CONFIRMED',
        lastUpdated: expect.any(Date),
        dataSource: 'chain'
      });

      // 验证 currentInvoice 也被正确更新
      expect(state.currentInvoice?.status).toBe(InvoiceStatus.PAID);
      expect(state.currentInvoice?.metadata).toEqual({
        confirmationStatus: 'CONFIRMED',
        lastUpdated: expect.any(Date),
        dataSource: 'chain'
      });
    });

    it('应该正确合并 metadata（updates 中的 metadata 应该覆盖现有的）', async () => {
      const invoiceWithMetadata = {
        ...mockInvoice,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date('2024-01-01'),
          dataSource: 'local' as const
        }
      };

      useInvoiceStore.setState({
        invoices: [invoiceWithMetadata],
        currentInvoice: invoiceWithMetadata
      });

      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date('2024-01-01'),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      // 更新 metadata
      const newMetadata = {
        confirmationStatus: 'CONFIRMED' as const,
        lastUpdated: new Date(),
        dataSource: 'chain' as const
      };

      await store.updateInvoice(mockInvoice.id, { metadata: newMetadata }, { masterKey, persistFull: true });

      // 验证 metadata 被正确更新
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].metadata?.confirmationStatus).toBe('CONFIRMED');
      expect(state.invoices[0].metadata?.dataSource).toBe('chain');
      expect(state.invoices[0].metadata?.lastUpdated).toBeInstanceOf(Date);

      // 验证 currentInvoice 也被正确更新
      expect(state.currentInvoice?.metadata?.confirmationStatus).toBe('CONFIRMED');
      expect(state.currentInvoice?.metadata?.dataSource).toBe('chain');
    });

    it('应该在没有 currentInvoice 时从 invoices 中查找', async () => {
      useInvoiceStore.setState({
        invoices: [mockInvoice],
        currentInvoice: null
      });

      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      await store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { masterKey, persistFull: true });

      // 验证更新成功
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PAID);
      expect(state.currentInvoice).toBeNull(); // currentInvoice 应该保持为 null
    });
  });

  describe('getInvoiceByHash', () => {
    it('应该从内存中返回发票', async () => {
      useInvoiceStore.setState({ invoices: [mockInvoice] });
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash(mockInvoice.invoiceHash, { masterKey });

      expect(result).toEqual(mockInvoice);
      expect(mockStorageService.getAllData).not.toHaveBeenCalled();
    });

    it('应该从 IndexedDB 加载发票（当内存中没有时）', async () => {
      const storageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData]);
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash(mockInvoice.invoiceHash, { masterKey, loadFromDB: true });

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockInvoice.id);
      expect(result?.invoiceHash).toBe(mockInvoice.invoiceHash);
      expect(result?.details).toEqual(mockInvoiceDetails);

      // 验证解密调用
      expect(mockCryptoService.decryptInvoiceDetails).toHaveBeenCalledWith(mockEncryptedDetails, masterKey);

      // 验证内存状态更新
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);
    });

    it('应该在找不到发票时返回 null', async () => {
      mockStorageService.getAllData.mockResolvedValue([]);
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash('nonexistent-hash' as any, { masterKey });

      expect(result).toBeNull();
    });

    it('应该在 loadFromDB 为 false 时只从内存查找', async () => {
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash(mockInvoice.invoiceHash, { masterKey, loadFromDB: false });

      expect(result).toBeNull();
      expect(mockStorageService.getAllData).not.toHaveBeenCalled();
    });

    it('应该在没有 masterKey 时只从内存查找', async () => {
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash(mockInvoice.invoiceHash, { loadFromDB: true });

      expect(result).toBeNull();
      expect(mockStorageService.getAllData).not.toHaveBeenCalled();
    });
  });

  describe('getAllInvoices', () => {
    it('应该从 IndexedDB 加载所有发票', async () => {
      const storageData1 = {
        id: '1field' as any,
        invoiceHash: 'hash1field' as any,
        seller: 'aleo1seller1' as any,
        buyer: 'aleo1buyer1' as any,
        amount: BigInt('1000000'),
        dueDate: new Date('2024-12-31'),
        createdAt: new Date('2024-01-01'),
        status: InvoiceStatus.PENDING,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      const storageData2 = {
        id: '2field' as any,
        invoiceHash: 'hash2field' as any,
        seller: 'aleo1seller2' as any,
        buyer: 'aleo1buyer2' as any,
        amount: BigInt('2000000'),
        dueDate: new Date('2024-12-31'),
        createdAt: new Date('2024-01-02'),
        status: InvoiceStatus.PAID,
        encryptedDetails: null,
        metadata: {
          confirmationStatus: 'CONFIRMED' as const,
          lastUpdated: new Date(),
          dataSource: 'chain' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData1, storageData2]);
      const store = useInvoiceStore.getState();

      const result = await store.getAllInvoices({ masterKey, refreshMemory: true });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1field');
      expect(result[0].details).toEqual(mockInvoiceDetails);
      expect(result[1].id).toBe('2field');
      expect(result[1].details).toBeUndefined();

      // 验证内存状态更新
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(2);
    });

    it('应该在 refreshMemory 为 false 时不更新内存', async () => {
      const storageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData]);
      useInvoiceStore.setState({ invoices: [] });
      const store = useInvoiceStore.getState();

      await store.getAllInvoices({ masterKey, refreshMemory: false });

      // 验证内存状态没有更新
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(0);
    });

    it('应该处理解密失败的情况', async () => {
      const storageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData]);
      mockCryptoService.decryptInvoiceDetails.mockRejectedValue(new Error('Decryption failed'));
      const store = useInvoiceStore.getState();

      const result = await store.getAllInvoices({ masterKey });

      // 验证即使解密失败，也返回基本信息
      expect(result).toHaveLength(1);
      expect(result[0].details).toBeUndefined();
    });

    it('应该在没有 masterKey 时返回未解密的发票', async () => {
      const storageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData]);
      const store = useInvoiceStore.getState();

      const result = await store.getAllInvoices({ refreshMemory: true });

      expect(result).toHaveLength(1);
      expect(result[0].details).toBeUndefined();
      expect(mockCryptoService.decryptInvoiceDetails).not.toHaveBeenCalled();
    });
  });

  describe('setInvoices', () => {
    it('应该批量设置发票到内存和 IndexedDB', async () => {
      const invoices = [
        mockInvoice,
        { ...mockInvoice, id: '2field' as any, invoiceHash: 'hash2field' as any }
      ];

      const store = useInvoiceStore.getState();

      await store.setInvoices(invoices, { masterKey, persistFull: true });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(2);

      // 验证批量添加调用
      expect(mockStorageService.addData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        expect.arrayContaining([
          expect.objectContaining({
            key: mockInvoice.id,
            data: expect.objectContaining({
              id: mockInvoice.id,
              invoiceHash: mockInvoice.invoiceHash
            })
          }),
          expect.objectContaining({
            key: '2field',
            data: expect.objectContaining({
              id: '2field',
              invoiceHash: 'hash2field'
            })
          })
        ])
      );
    });

    it('应该在没有 masterKey 时只更新内存', async () => {
      const invoices = [mockInvoice];
      const store = useInvoiceStore.getState();

      await store.setInvoices(invoices, { persistFull: true });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);

      // 验证没有调用存储服务
      expect(mockStorageService.addData).not.toHaveBeenCalled();
    });

    it('应该在 persistFull 为 false 时只更新内存', async () => {
      const invoices = [mockInvoice];
      const store = useInvoiceStore.getState();

      await store.setInvoices(invoices, { masterKey, persistFull: false });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);

      // 验证没有调用存储服务
      expect(mockStorageService.addData).not.toHaveBeenCalled();
    });

    it('应该处理部分发票加密失败的情况（继续处理其他发票）', async () => {
      const invoices = [
        mockInvoice,
        { ...mockInvoice, id: '2field' as any, invoiceHash: 'hash2field' as any }
      ];

      // 模拟第二个发票加密失败
      mockCryptoService.encryptInvoiceDetails
        .mockResolvedValueOnce(mockEncryptedDetails)
        .mockRejectedValueOnce(new Error('Encryption failed'));

      const store = useInvoiceStore.getState();

      await store.setInvoices(invoices, { masterKey, persistFull: true });

      // 验证内存状态仍然更新（所有发票，因为加密失败不会导致整个操作失败）
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(2);

      // 验证只成功存储了第一个发票（第二个发票因为加密失败被跳过）
      expect(mockStorageService.addData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        expect.arrayContaining([
          expect.objectContaining({ key: mockInvoice.id })
        ])
      );
    });

    it('应该在存储失败时抛出错误且不更新内存（保持数据库和内存同步）', async () => {
      const invoices = [
        mockInvoice,
        { ...mockInvoice, id: '2field' as any, invoiceHash: 'hash2field' as any }
      ];

      const error = new Error('Storage failed');
      mockStorageService.addData.mockRejectedValue(error);
      const store = useInvoiceStore.getState();

      await expect(
        store.setInvoices(invoices, { masterKey, persistFull: true })
      ).rejects.toThrow('Storage failed');

      // 验证内存状态未更新（保持数据库和内存同步）
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(0);
    });

    it('应该处理空数组', async () => {
      const store = useInvoiceStore.getState();

      await store.setInvoices([], { masterKey, persistFull: true });

      // 验证内存状态
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(0);

      // 验证没有调用存储服务（因为 dataList 为空）
      expect(mockStorageService.addData).not.toHaveBeenCalled();
    });
  });
});

