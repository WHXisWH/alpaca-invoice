import { useMemo, useState, useCallback } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useInvoiceStore as useOldInvoiceStore } from '@/stores/invoiceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceInitialize } from './useInvoiceInitialize';
import { InvoiceStatus, type Invoice, AleoField } from '@/lib/types';
import { IInvoices } from './IInvoices';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { createWalletAdapter } from '@/controller/Wallet/useWalletController';
import { cleanAleoNumber } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * useInvoices Hook
 * 发票列表页的业务逻辑控制器
 * 
 * 职责：
 * 1. 管理初始化状态（通过 useInvoiceInitialize）
 * 2. 管理过滤和搜索状态
 * 3. 根据当前用户地址判断发票角色
 * 4. 提供过滤后的发票列表
 */
const PROGRAM_ID = 'zk_invoice.aleo';

export function useInvoices(): IInvoices {
  const wallet = useWallet();
  
  // 使用初始化 hook
  const { initialize, handleUnlock, isAuthRequired, isLoading, isReady } = useInvoiceInitialize();
  
  // 从 Store 获取数据
  const { invoices, updateInvoice, setConfirmationStatus } = useInvoiceStore();
  const { 
    payInvoice: storePayInvoice,
    cancelInvoice: storeCancelInvoice
  } = useOldInvoiceStore();
  const { publicKey, masterKey } = useUserStore();
  
  // 本地状态：过滤和搜索
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');
  const [search, setSearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // 创建服务实例
  const walletService = useMemo(() => new WalletService(createWalletAdapter(wallet)), [wallet]);
  const cryptoService = useMemo(() => new CryptoService(), []);
  const storageService = useMemo(() => new StorageService(), []);

  /**
   * 根据当前用户地址判断发票角色（SELLER/BUYER/BOTH）
   */
  const invoicesWithRole = useMemo(() => {
    if (!publicKey) return [];
    
    return invoices.map((invoice) => {
      const isSeller = invoice.seller === publicKey;
      const isBuyer = invoice.buyer === publicKey;
      
      let role: 'SELLER' | 'BUYER' | 'BOTH' = 'SELLER';
      if (isSeller && isBuyer) {
        role = 'BOTH';
      } else if (isBuyer) {
        role = 'BUYER';
      } else if (isSeller) {
        role = 'SELLER';
      }
      
      return { invoice, role };
    });
  }, [invoices, publicKey]);

  /**
   * 前端过滤和搜索（基于 Store 数据）
   */
  const filteredInvoices = useMemo(() => {
    return invoicesWithRole.filter(({ invoice }) => {
      // 状态过滤
      const matchStatus =
        filter === 'all'
          ? true
          : filter === 'pending'
            ? invoice.status === InvoiceStatus.PENDING
            : filter === 'paid'
              ? invoice.status === InvoiceStatus.PAID
              : invoice.status === InvoiceStatus.CANCELLED;
      
      // 搜索过滤
      const searchLower = search.trim().toLowerCase();
      const matchSearch =
        searchLower === '' ||
        invoice.id.toLowerCase().includes(searchLower) ||
        invoice.invoiceHash.toLowerCase().includes(searchLower) ||
        invoice.buyer.toLowerCase().includes(searchLower) ||
        invoice.seller.toLowerCase().includes(searchLower);
      
      return matchStatus && matchSearch;
    });
  }, [invoicesWithRole, filter, search]);

  /**
   * 刷新发票列表
   */
  const refresh = useCallback(async () => {
    await initialize();
  }, [initialize]);

  /**
   * 处理支付发票（买家操作）
   */
  const handlePay = useCallback(async (invoiceId: AleoField) => {
    try {
      toast.loading('Processing payment...', { id: `pay-${invoiceId}` });
      const result = await storePayInvoice(invoiceId);
      toast.success('Payment successful!', {
        id: `pay-${invoiceId}`,
        description: `Transaction ID: ${result.transactionId.slice(0, 16)}...`
      });
      // Refresh invoice list to show updated status
      await refresh();
    } catch (error) {
      toast.error('Payment failed', {
        id: `pay-${invoiceId}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      throw error;
    }
  }, [storePayInvoice, refresh]);

  /**
   * 处理取消发票（卖家操作）
   */
  const handleCancel = useCallback(async (invoiceId: AleoField) => {
    try {
      toast.loading('Cancelling invoice...', { id: `cancel-${invoiceId}` });
      await storeCancelInvoice(invoiceId);
      toast.success('Invoice cancelled successfully', { id: `cancel-${invoiceId}` });
      // Refresh invoice list to show updated status
      await refresh();
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: `cancel-${invoiceId}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      throw error;
    }
  }, [storeCancelInvoice, refresh]);

  /**
   * 从链上同步所有发票的最新状态
   */
  const handleSyncAll = useCallback(async () => {
    if (!publicKey || !masterKey || invoices.length === 0) {
      toast.error('Unable to sync', {
        description: 'Missing required data or no invoices found'
      });
      return;
    }

    setIsSyncing(true);
    try {
      console.log('🔄 [handleSyncAll] Starting batch sync for all invoices');
      toast.loading('Syncing all invoices...', { id: 'sync-all' });

      // Scan all records from chain
      const response = await walletService.requestRecords(PROGRAM_ID);
      const records: any[] = response.records || [];
      console.log(`📋 [handleSyncAll] Found ${records.length} records on chain`);

      // Build a map of invoice_id -> latest record (prefer PaymentRecord)
      const recordMap = new Map<string, { record: AleoInvoiceRecord | AleoPaymentRecord; type: 'invoice' | 'payment' }>();

      for (const record of records) {
        try {
          // Parse Record data
          let recordData: any;
          
          if (typeof record === 'string') {
            recordData = JSON.parse(record);
          } else if (record && typeof record === 'object') {
            if (record.data) {
              recordData = typeof record.data === 'string' 
                ? JSON.parse(record.data) 
                : record.data;
            } else {
              recordData = record;
            }
          } else {
            continue;
          }
          
          if (!recordData) continue;

          // Parse to common format
          const recordJsonString = typeof recordData === 'string' 
            ? recordData 
            : JSON.stringify(recordData);
          
          const parsedRecord = await cryptoService.parseAleoRecord<any>(recordJsonString);
          
          // Determine if it's InvoiceRecord or PaymentRecord
          const isPaymentRecord = 'payment_id' in parsedRecord && parsedRecord.payment_id;
          const isInvoiceRecord = 'invoice_hash' in parsedRecord && parsedRecord.invoice_hash;
          
          if (isPaymentRecord || isInvoiceRecord) {
            const cleanInvoiceId = parsedRecord.invoice_id?.replace(/field\.(private|public)$/, 'field');
            
            if (cleanInvoiceId) {
              const recordType = isPaymentRecord ? 'payment' : 'invoice';
              const existing = recordMap.get(cleanInvoiceId);
              
              // PaymentRecord takes priority over InvoiceRecord
              if (!existing || (recordType === 'payment' && existing.type === 'invoice')) {
                recordMap.set(cleanInvoiceId, {
                  record: parsedRecord,
                  type: recordType
                });
              }
            }
          }
        } catch (error) {
          console.warn('Failed to parse record:', error);
          continue;
        }
      }

      console.log(`✅ [handleSyncAll] Built record map with ${recordMap.size} unique invoices`);

      // Update each invoice based on chain records
      let updatedCount = 0;
      for (const invoice of invoices) {
        try {
          const cleanInvoiceId = invoice.id?.replace(/field\.(private|public)$/, 'field');
          const recordData = recordMap.get(cleanInvoiceId);
          
          if (!recordData) {
            console.log(`⚠️ [handleSyncAll] No chain record found for invoice: ${cleanInvoiceId}`);
            continue;
          }

          const { record, type } = recordData;
          console.log(`🔄 [handleSyncAll] Updating invoice ${cleanInvoiceId} with ${type} record`);

          // Build update data based on record type
          let updatedInvoice: Partial<Invoice>;

          if (type === 'payment') {
            const paymentRecord = record as AleoPaymentRecord;
            const cleanAmount = cleanAleoNumber(paymentRecord.amount);

            updatedInvoice = {
              id: cleanInvoiceId as AleoField,
              invoiceHash: invoice.invoiceHash, // Keep original hash - DO NOT UPDATE
              seller: paymentRecord.payee as any,
              buyer: paymentRecord.payer as any,
              amount: BigInt(cleanAmount) as any,
              dueDate: invoice.dueDate,
              createdAt: invoice.createdAt,
              status: 1 as any // PaymentRecord indicates PAID
            };
          } else {
            const invoiceRecord = record as AleoInvoiceRecord;
            const cleanAmount = cleanAleoNumber(invoiceRecord.amount);
            const cleanDueDate = cleanAleoNumber(invoiceRecord.due_date);
            const cleanCreatedAt = cleanAleoNumber(invoiceRecord.created_at);
            const cleanStatus = cleanAleoNumber(invoiceRecord.status);

            updatedInvoice = {
              id: cleanInvoiceId as AleoField,
              invoiceHash: invoice.invoiceHash, // Keep original hash - DO NOT UPDATE
              seller: invoiceRecord.seller as any,
              buyer: invoiceRecord.buyer as any,
              amount: BigInt(cleanAmount) as any,
              dueDate: new Date(Number(cleanDueDate) * 1000),
              createdAt: new Date(Number(cleanCreatedAt) * 1000),
              status: Number(cleanStatus) as any
            };
          }

          // Update Store
          updateInvoice(invoice.id, updatedInvoice);
          setConfirmationStatus(invoice.invoiceHash, 'CONFIRMED');

          // Sync update IndexedDB (keep details unchanged)
          if (invoice.details) {
            const encryptedPayload = await cryptoService.encryptInvoiceDetails(
              invoice.details,
              masterKey
            );
            await storageService.saveEncryptedInvoice(invoice.invoiceHash, encryptedPayload);
          }

          updatedCount++;
        } catch (error) {
          console.error(`Failed to update invoice ${invoice.id}:`, error);
          continue;
        }
      }

      toast.success('Batch sync successful', {
        id: 'sync-all',
        description: `Updated ${updatedCount} invoice(s) from chain`
      });

      console.log(`✅ [handleSyncAll] Sync completed - Updated ${updatedCount}/${invoices.length} invoices`);
    } catch (error) {
      console.error('Failed to sync all invoices:', error);
      toast.error('Sync failed', {
        id: 'sync-all',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSyncing(false);
    }
  }, [publicKey, masterKey, invoices, walletService, cryptoService, storageService, updateInvoice, setConfirmationStatus]);

  /**
   * 业务逻辑判断：是否显示授权遮罩
   */
  const showAuthModal = useMemo(() => {
    return isAuthRequired;
  }, [isAuthRequired]);

  /**
   * 业务逻辑判断：是否显示加载状态
   */
  const showLoading = useMemo(() => {
    return isLoading;
  }, [isLoading]);

  /**
   * 业务逻辑判断：是否显示钱包连接提示
   */
  const showWalletPrompt = useMemo(() => {
    return !isReady && !isAuthRequired;
  }, [isReady, isAuthRequired]);

  /**
   * 业务逻辑判断：是否显示主内容
   */
  const showMainContent = useMemo(() => {
    return isReady && !isAuthRequired && !isLoading;
  }, [isReady, isAuthRequired, isLoading]);

  return {
    filteredInvoices,
    filter,
    search,
    isAuthRequired,
    isLoading,
    isReady,
    isSyncing,
    showAuthModal,
    showLoading,
    showWalletPrompt,
    showMainContent,
    setFilter,
    setSearch,
    handleUnlock,
    refresh,
    handleSyncAll,
    handlePay,
    handleCancel
  };
}

