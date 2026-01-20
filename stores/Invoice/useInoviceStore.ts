import { create } from 'zustand';
import { InvoiceState, ChainConfirmationStatus } from './InvoiceState';
import { Invoice, AleoField, AleoAddress, EncryptedPayload, InvoiceStatus } from '@/lib/types';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';

// ✅ 服务实例（单例模式，延迟初始化）
let storageServiceInstance: StorageService | null = null;
let cryptoServiceInstance: CryptoService | null = null;

const getStorageService = (): StorageService => {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService();
  }
  return storageServiceInstance;
};

const getCryptoService = (): CryptoService => {
  if (!cryptoServiceInstance) {
    cryptoServiceInstance = new CryptoService();
  }
  return cryptoServiceInstance;
};

// ✅ 表名常量
const INVOICE_TABLE = 'invoices';

/**
 * 发票存储数据结构（IndexedDB 中存储的格式）
 * 直接使用 Invoice 的基本字段，不需要嵌套 basicInfo
 */
interface InvoiceStorageData {
  // Invoice 的基本字段
  id: AleoField;
  invoiceHash: AleoField;
  seller: AleoAddress;
  buyer: AleoAddress;
  amount: bigint;
  dueDate: Date;
  createdAt: Date;
  status: InvoiceStatus;
  // 加密的 details
  encryptedDetails: EncryptedPayload | null;
  // 元数据
  metadata: {
    confirmationStatus: ChainConfirmationStatus;
    lastUpdated: Date;
    dataSource: 'local' | 'chain';
    action?: 'create' | 'cancel' | 'pay'; // ✅ 标识当前操作类型
  };
}

/**
 * Invoice Store 实现
 * 所有方法都直接与 IndexedDB 交互（使用通用存储接口）
 */
export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  // 初始状态
  invoices: [],
  currentInvoice: null,  // ✅ 新增：当前选中的 invoice

  /**
   * ✅ 添加发票：接收发票 → 保存到 IndexedDB → 更新内存
   */
  addInvoice: async (invoice, options = {}) => {
    const { masterKey, persistFull = true } = options;
    
    // 1. ✅ 持久化完整发票信息到 IndexedDB（如果启用）
    if (persistFull && masterKey) {
      try {
        // 加密 details（如果存在）
        const encryptedDetails = invoice.details
          ? await getCryptoService().encryptInvoiceDetails(invoice.details, masterKey)
          : null;
        
        // 构建存储数据（直接使用 Invoice 的基本字段）
        const storageData: InvoiceStorageData = {
          id: invoice.id,
          invoiceHash: invoice.invoiceHash,
          seller: invoice.seller,
          buyer: invoice.buyer,
          amount: invoice.amount,
          dueDate: invoice.dueDate,
          createdAt: invoice.createdAt,
          status: invoice.status,
          encryptedDetails: encryptedDetails,
          metadata: {
            confirmationStatus: 'SENDING',
            lastUpdated: new Date(),
            dataSource: 'local'
          }
        };

        // ✅ 使用通用存储接口（使用 invoiceId 作为 key）
        await getStorageService().addData(INVOICE_TABLE, invoice.id, storageData);

        console.log('✅ [Store.addInvoice] Persisted full invoice to IndexedDB:', invoice.invoiceHash);
      } catch (error) {
        console.error('❌ [Store.addInvoice] Failed to persist:', error);
        // 持久化失败时抛出错误，不更新内存，保持数据库和内存同步
        throw error;
      }
    }

    // 2. 更新内存状态（仅在持久化成功或不需要持久化时）
    // ✅ 确保 invoice 包含 metadata（如果没有，添加默认值）
    const invoiceWithMetadata = invoice.metadata ? invoice : {
      ...invoice,
      metadata: {
        confirmationStatus: 'SENDING' as ChainConfirmationStatus,
        lastUpdated: new Date(),
        dataSource: 'local' as const
      }
    };
    
    set((state) => ({
      invoices: [...state.invoices, invoiceWithMetadata]
    }));
  },

  /**
   * ✅ 更新发票：接收更新 → 保存到 IndexedDB → 更新内存
   */
  updateInvoice: async (id, updates, options = {}) => {
    const { masterKey, persistFull = true } = options;
    const state = get();
    
    // ✅ 优先使用 currentInvoice（如果存在且 id 匹配），否则从 invoices 中查找
    let currentInvoice = state.currentInvoice?.id === id 
      ? state.currentInvoice 
      : state.invoices.find(inv => inv.id === id);
    
    if (!currentInvoice) {
      console.warn('⚠️ [Store.updateInvoice] Invoice not found:', id);
      return;
    }

    // ✅ 正确合并 metadata（如果 updates 中有 metadata，使用它；否则保持现有的）
    const updatedInvoice = { 
      ...currentInvoice, 
      ...updates,
      // ✅ 确保 metadata 正确合并：如果 updates 中有 metadata，使用它；否则保持 currentInvoice 的 metadata
      metadata: (updates as any).metadata || currentInvoice.metadata
    };

    // 1. ✅ 同步更新 IndexedDB
    if (persistFull && masterKey) {
      try {
        // ✅ 尝试查找现有记录：先使用传入的 id，如果找不到则尝试添加 .private 后缀
        let existing = await getStorageService().getData<InvoiceStorageData>(
          INVOICE_TABLE,
          id
        );

        // ✅ 如果找不到，尝试使用带 .private 后缀的 id
        let dbKey = id;
        if (!existing && !id.endsWith('.private')) {
          const idWithPrivate = `${id}.private` as AleoField;
          existing = await getStorageService().getData<InvoiceStorageData>(
            INVOICE_TABLE,
            idWithPrivate
          );
          
          // ✅ 如果找到了，更新 dbKey 为带 .private 后缀的版本，以便后续更新操作使用正确的 key
          if (existing) {
            dbKey = idWithPrivate;
            console.log('✅ [Store.updateInvoice] Found record with .private suffix, using:', dbKey);
          }
        }

        if (!existing) {
          console.warn('⚠️ [Store.updateInvoice] Invoice not found in IndexedDB:', id);
          return;
        }

        // 加密更新的 details（如果存在）
        const encryptedDetails = updatedInvoice.details
          ? await getCryptoService().encryptInvoiceDetails(updatedInvoice.details, masterKey)
          : existing.encryptedDetails;

        // 构建更新数据（直接使用 Invoice 的基本字段）
        // ✅ 使用 updatedInvoice.metadata（已经正确合并），如果没有则使用 existing.metadata
        const finalMetadata = updatedInvoice.metadata || existing.metadata;
        const storageUpdates: Partial<InvoiceStorageData> = {
          id: updatedInvoice.id,
          invoiceHash: updatedInvoice.invoiceHash,
          seller: updatedInvoice.seller,
          buyer: updatedInvoice.buyer,
          amount: updatedInvoice.amount,
          dueDate: updatedInvoice.dueDate,
          createdAt: updatedInvoice.createdAt,
          status: updatedInvoice.status,
          encryptedDetails: encryptedDetails,
          metadata: {
            confirmationStatus: finalMetadata.confirmationStatus,
            lastUpdated: new Date(),
            dataSource: finalMetadata.dataSource
          }
        };

        // ✅ 使用通用存储接口更新（使用正确的 dbKey，可能是带 .private 后缀的）
        await getStorageService().updateData(INVOICE_TABLE, dbKey, storageUpdates);

        console.log('✅ [Store.updateInvoice] Updated in IndexedDB:', dbKey);
      } catch (error) {
        console.error('❌ [Store.updateInvoice] Failed to update IndexedDB:', error);
        // 持久化失败时抛出错误，不更新内存，保持数据库和内存同步
        throw error;
      }
    }

    // 2. 更新内存（仅在持久化成功或不需要持久化时）
    set((state) => {
      const updatedInvoices = state.invoices.map((inv) =>
        inv.id === id ? updatedInvoice : inv
      );
      
      // ✅ 如果更新的是当前 invoice，同步更新 currentInvoice
      const newCurrentInvoice = state.currentInvoice?.id === id 
        ? updatedInvoice 
        : state.currentInvoice;

      return {
        invoices: updatedInvoices,
        currentInvoice: newCurrentInvoice
      };
    });
  },

  /**
   * ✅ 根据 hash 获取发票的 metadata（confirmationStatus）
   */
  getInvoiceMetadata: async (hash: AleoField): Promise<{ confirmationStatus: ChainConfirmationStatus } | null> => {
    try {
      const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
      const dbRecord = allDBRecords.find(record => record.invoiceHash === hash);
      
      if (dbRecord) {
        return {
          confirmationStatus: dbRecord.metadata.confirmationStatus
        };
      }
      return null;
    } catch (error) {
      console.error('❌ [Store.getInvoiceMetadata] Failed to load metadata:', error);
      return null;
    }
  },

  /**
   * ✅ 根据 hash 获取发票：IndexedDB → 解密 → 更新内存（如需要）→ 返回
   * 注意：由于 key 是 invoiceId，需要通过 hash 查找，需要遍历所有数据或使用索引
   * 这里先尝试从内存查找，如果内存没有则从 IndexedDB 加载所有数据后查找
   */
  getInvoiceByHash: async (hash, options = {}) => {
    const { masterKey, loadFromDB = true } = options;
    const state = get();
    
    // 1. 先从内存查找
    const invoiceInMemory = state.invoices.find((inv) => inv.invoiceHash === hash);
    if (invoiceInMemory) {
      return invoiceInMemory;
    }
    
    // 2. ✅ 从 IndexedDB 读取（由于 key 是 invoiceId，需要遍历查找）
    if (loadFromDB && masterKey) {
      try {
        // 获取所有数据，然后通过 hash 查找
        const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
        const dbRecord = allDBRecords.find(record => record.invoiceHash === hash);
        
        if (dbRecord) {
          // 解密 details（如果存在）
          const details = dbRecord.encryptedDetails
            ? await getCryptoService().decryptInvoiceDetails(dbRecord.encryptedDetails, masterKey)
            : undefined;

          // ✅ 构建完整发票对象（直接使用存储的字段，包含 metadata）
          const invoice: Invoice = {
            id: dbRecord.id,
            invoiceHash: dbRecord.invoiceHash,
            seller: dbRecord.seller,
            buyer: dbRecord.buyer,
            amount: dbRecord.amount,
            dueDate: dbRecord.dueDate,
            createdAt: dbRecord.createdAt,
            status: dbRecord.status,
            details: details,
            metadata: dbRecord.metadata  // ✅ 包含 metadata
          };

          // ✅ 更新内存状态
          set((state) => ({
            invoices: [...state.invoices, invoice]
          }));

          console.log('✅ [Store.getInvoiceByHash] Loaded from IndexedDB:', hash);
          return invoice;
        }
      } catch (error) {
        console.error('❌ [Store.getInvoiceByHash] Failed to load from IndexedDB:', error);
      }
    }

    return null;
  },

  /**
   * ✅ 从 IndexedDB 获取所有发票：IndexedDB → 解密 → 更新内存 → 返回
   */
  getAllInvoices: async (options = {}) => {
    const { masterKey, refreshMemory = true } = options;
    
    try {
      // 1. 从 IndexedDB 读取所有记录
      const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
      console.log(`📦 [Store.getAllInvoices] Found ${allDBRecords.length} invoices in IndexedDB`);
      
      const invoices: Invoice[] = [];
      
      // 2. 批量解密并构建完整发票对象
      for (const dbRecord of allDBRecords) {
        try {
          // 解密 details（如果有 masterKey）
          const details = (masterKey && dbRecord.encryptedDetails)
            ? await getCryptoService().decryptInvoiceDetails(dbRecord.encryptedDetails, masterKey)
            : undefined;

          // 构建完整发票对象（直接使用存储的字段，包含 metadata）
          const invoice: Invoice = {
            id: dbRecord.id,
            invoiceHash: dbRecord.invoiceHash,
            seller: dbRecord.seller,
            buyer: dbRecord.buyer,
            amount: dbRecord.amount,
            dueDate: dbRecord.dueDate,
            createdAt: dbRecord.createdAt,
            status: dbRecord.status,
            details: details,
            metadata: dbRecord.metadata  // ✅ 包含 metadata
          };

          invoices.push(invoice);
        } catch (error) {
          console.error(`Failed to decrypt invoice ${dbRecord.invoiceHash}:`, error);
          // 继续处理其他发票（即使解密失败，也保留基本信息）
          const invoice: Invoice = {
            id: dbRecord.id,
            invoiceHash: dbRecord.invoiceHash,
            seller: dbRecord.seller,
            buyer: dbRecord.buyer,
            amount: dbRecord.amount,
            dueDate: dbRecord.dueDate,
            createdAt: dbRecord.createdAt,
            status: dbRecord.status,
            details: undefined,
            metadata: dbRecord.metadata  // ✅ 包含 metadata
          };
          invoices.push(invoice);
        }
      }
      
      // 3. ✅ 更新内存状态（如果 refreshMemory 为 true）
      if (refreshMemory) {
        set({
          invoices: invoices
        });
        console.log(`✅ [Store.getAllInvoices] Updated memory state with ${invoices.length} invoices`);
      }
      
      return invoices;
    } catch (error) {
      console.error('❌ [Store.getAllInvoices] Failed to load from IndexedDB:', error);
      throw error;
    }
  },

  /**
   * ✅ 批量设置发票：接收数组 → 清空 IndexedDB → 保存新数据 → 更新内存
   * 实现真正的重置：确保 IndexedDB 和内存状态完全一致
   */
  setInvoices: async (invoices, options = {}) => {
    const { masterKey, persistFull = true, metadata } = options; // ✅ 添加 metadata 参数
    
    // 1. ✅ 批量保存到 IndexedDB（如果启用）
    if (persistFull && masterKey) {
      try {
        const storageService = getStorageService();
        
        // ✅ 先清空整个表（实现真正的重置）
        // 获取所有现有数据，然后删除它们
        const allExistingData = await storageService.getAllData<InvoiceStorageData>(INVOICE_TABLE);
        console.log('allExistingData', allExistingData)
        if (allExistingData.length > 0) {
          const allKeys = allExistingData.map(item => item.id);
          await storageService.deleteData(INVOICE_TABLE, allKeys);
          console.log(`✅ [Store.setInvoices] Cleared ${allKeys.length} existing invoices from IndexedDB`);
        }
        
        // 准备批量数据
        const dataList: Array<{ key: string; data: InvoiceStorageData }> = [];
        
        for (const invoice of invoices) {
          try {
            // 加密 details（如果存在）
            const encryptedDetails = invoice.details
              ? await getCryptoService().encryptInvoiceDetails(invoice.details, masterKey)
              : null;

            // ✅ 使用传入的 metadata 或默认值
            const invoiceMetadata = metadata || {
              confirmationStatus: 'SENDING' as ChainConfirmationStatus,
              lastUpdated: new Date(),
              dataSource: 'local' as const
            };

            // 构建存储数据（直接使用 Invoice 的基本字段）
            const storageData: InvoiceStorageData = {
              id: invoice.id,
              invoiceHash: invoice.invoiceHash,
              seller: invoice.seller,
              buyer: invoice.buyer,
              amount: invoice.amount,
              dueDate: invoice.dueDate,
              createdAt: invoice.createdAt,
              status: invoice.status,
              encryptedDetails: encryptedDetails,
              metadata: invoiceMetadata // ✅ 使用传入的 metadata
            };

            dataList.push({
              key: invoice.id,  // ✅ 使用 invoiceId 作为 key
              data: storageData
            });
          } catch (error) {
            console.error(`Failed to prepare invoice ${invoice.invoiceHash} for storage:`, error);
            // 继续处理其他发票
          }
        }

        // ✅ 添加新数据
        if (dataList.length > 0) {
          await storageService.addData(INVOICE_TABLE, dataList);
          console.log(`✅ [Store.setInvoices] Saved ${dataList.length} invoices to IndexedDB`);
        } else {
          console.log(`✅ [Store.setInvoices] No new invoices to save (IndexedDB already cleared)`);
        }
      } catch (error) {
        console.error('❌ [Store.setInvoices] Failed to persist to IndexedDB:', error);
        // 持久化失败时抛出错误，不更新内存，保持数据库和内存同步
        throw error;
      }
    }
    
    // 2. ✅ 更新内存状态（仅在持久化成功或不需要持久化时）
    set({
      invoices: invoices
    });
    
    console.log(`✅ [Store.setInvoices] Updated memory state with ${invoices.length} invoices`);
  },

  /**
   * ✅ 设置当前 invoice
   */
  setCurrentInvoice: async (hash, options = {}) => {
    const { masterKey } = options;
    
    if (!hash) {
      set({ currentInvoice: null });
      return;
    }

    const state = get();
    
    // 1. 先从内存查找
    let invoice = state.invoices.find((inv) => inv.invoiceHash === hash);
    
    // 2. 如果内存没有，从 IndexedDB 加载（复用 getInvoiceByHash 的逻辑）
    if (!invoice && masterKey) {
      try {
        const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
        const dbRecord = allDBRecords.find(record => record.invoiceHash === hash);
        
        if (dbRecord) {
          // 解密 details（如果存在）
          const details = dbRecord.encryptedDetails
            ? await getCryptoService().decryptInvoiceDetails(dbRecord.encryptedDetails, masterKey)
            : undefined;

          // 构建完整发票对象（包含 metadata）
          invoice = {
            id: dbRecord.id,
            invoiceHash: dbRecord.invoiceHash,
            seller: dbRecord.seller,
            buyer: dbRecord.buyer,
            amount: dbRecord.amount,
            dueDate: dbRecord.dueDate,
            createdAt: dbRecord.createdAt,
            status: dbRecord.status,
            details: details,
            metadata: dbRecord.metadata
          };

          // 更新内存状态（如果 invoice 不在内存中）
          set((state) => ({
            invoices: [...state.invoices, invoice!]
          }));
        }
      } catch (error) {
        console.error('❌ [Store.setCurrentInvoice] Failed to load from IndexedDB:', error);
      }
    }

    if (invoice) {
      // 3. 如果 invoice 没有 metadata，从 IndexedDB 获取
      if (!invoice.metadata) {
        try {
          const allDBRecords = await getStorageService().getAllData<InvoiceStorageData>(INVOICE_TABLE);
          const dbRecord = allDBRecords.find(record => record.invoiceHash === hash);
          
          if (dbRecord?.metadata) {
            invoice = {
              ...invoice,
              metadata: dbRecord.metadata
            };
          } else {
            // 如果没有 metadata，添加默认值
            invoice = {
              ...invoice,
              metadata: {
                confirmationStatus: 'SENDING' as ChainConfirmationStatus,
                lastUpdated: new Date(),
                dataSource: 'local' as const
              }
            };
          }
        } catch (error) {
          console.error('❌ [Store.setCurrentInvoice] Failed to load metadata:', error);
          // 添加默认 metadata
          invoice = {
            ...invoice,
            metadata: {
              confirmationStatus: 'SENDING' as ChainConfirmationStatus,
              lastUpdated: new Date(),
              dataSource: 'local' as const
            }
          };
        }
      }
      
      set({ currentInvoice: invoice });
      console.log('✅ [Store.setCurrentInvoice] Set current invoice:', hash);
    } else {
      set({ currentInvoice: null });
      console.warn('⚠️ [Store.setCurrentInvoice] Invoice not found:', hash);
    }
  }
}));
