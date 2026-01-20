import { useMemo, useState, useEffect, useCallback } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoField, Invoice } from '@/lib/types';
import { IInvoices } from './IInvoices';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromPaymentRecord, updateInvoiceFromInvoiceRecord, buildInvoiceFromRecord, cleanAleoField } from '@/lib/invoice';
import { InvoiceStatusValidator } from '@/services/InvoiceStatusValidator/InvoiceStatusValidatorImpl';
import { useInvoiceListRole } from './useInvoiceListRole';
import { useInvoiceListFilter } from './useInvoiceListFilter';
import { useInvoiceListPolling } from './useInvoiceListPolling';
import { useInvoiceListInitialize } from './useInvoiceListInitialize';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';

/**
 * StatusConfig 类型定义（导出供 UI 使用）
 */
export type { StatusConfig } from './IInvoices';

/**
 * useInvoices Hook（重构后）
 * 作为组合器，组合各个子 hooks
 * 
 * 处理三种情况：
 * 1. 情况1：IndexedDB 为空 → 从链上扫描并存入 IndexedDB
 * 2. 情况2：IndexedDB 有数据 → 从 IndexedDB 加载到内存
 * 3. 情况3：发现 SENDING 状态的发票 → 启动轮询同步直到 CONFIRMED
 */
export function useInvoices(): IInvoices {
  const wallet = useWallet();
  const { publicKey, masterKey } = useUserStore();
  const { invoices, updateInvoice, setInvoices } = useInvoiceStore();
  const { scanAllInvoiceRecords, scanAllPaymentRecords } = useInvoiceChainScan();
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. 初始化逻辑
  const [sendingHashes, setSendingHashes] = useState<AleoField[]>([]);
  const { isLoading, chainStatusMap, setChainStatusMap, initialize } = useInvoiceListInitialize(
    useCallback((hashes: AleoField[]) => {
      // 当发现 SENDING 状态的发票时，保存到状态
      setSendingHashes(hashes);
    }, [])
  );

  // 状态更新回调
  const handleStatusUpdate = useCallback((hash: AleoField, status: ChainConfirmationStatus) => {
    setChainStatusMap(prev => {
      const newMap = new Map(prev);
      newMap.set(hash, status);
      return newMap;
    });
  }, [setChainStatusMap]);

  // 2. 批量轮询
  const { startPolling, stopPolling } = useInvoiceListPolling(
    invoices,
    chainStatusMap,
    handleStatusUpdate
  );

  // 当发现 SENDING 状态的发票时，启动轮询
  useEffect(() => {
    if (sendingHashes.length > 0) {
      startPolling(sendingHashes);
      setSendingHashes([]); // 清空，避免重复启动
    }
  }, [sendingHashes, startPolling]);

  // 3. 角色判断（复用）
  const { invoicesWithRole } = useInvoiceListRole(invoices, chainStatusMap);

  // 4. 过滤和搜索
  const { filteredInvoices, filter, search, setFilter, setSearch } = useInvoiceListFilter(invoicesWithRole);

  // 5. 操作（列表页模式：需要为每个 invoice 创建处理函数）
  // 由于列表页有多个 invoice，不能使用单个 useInvoiceActions
  // 所以直接使用 useTransactionController 和 useErrorHandler
  const { executePay, executeCancel } = useTransactionController();
  const { handleError } = useErrorHandler();
  
  // ✅ 添加：跟踪每张发票的处理状态
  const [processingInvoiceIds, setProcessingInvoiceIds] = useState<Set<string>>(new Set());
  
  const handlePay = useCallback(async (invoice: Invoice) => {
    // ✅ 设置处理状态
    setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
    
    try {
      toast.loading('Processing payment...', { id: `pay-${invoice.id}` });
      const transactionId = await executePay(invoice);
      
      // ✅ 清除处理状态（executePay 已完成，现在进入轮询阶段）
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
      
      toast.success('Payment successful!', {
        id: `pay-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      
      // 1. 更新 chainStatusMap 为 SENDING（因为 executePay 已经更新了 invoice metadata）
      handleStatusUpdate(invoice.invoiceHash, 'SENDING');
      
      // 2. 启动轮询（如果还没有启动）
      startPolling([invoice.invoiceHash]);
    } catch (error) {
      toast.error('Payment failed', {
        id: `pay-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
      // ✅ 错误时清除处理状态
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  }, [executePay, handleError, handleStatusUpdate, startPolling]);

  const handleCancel = useCallback(async (invoice: Invoice) => {
    // ✅ 设置处理状态
    setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
    
    try {
      toast.loading('Cancelling invoice...', { id: `cancel-${invoice.id}` });
      const transactionId = await executeCancel(invoice);
      // ✅ executeCancel 已经通过 updateInvoice 更新了 invoice metadata 为 SENDING
      
      // ✅ 清除处理状态（executeCancel 已完成，现在进入轮询阶段）
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
      
      toast.success('Invoice cancelled successfully', { 
        id: `cancel-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      
      // ✅ 不调用 initialize()，而是：
      // 1. 更新 chainStatusMap 为 SENDING（因为 executeCancel 已经更新了 invoice metadata）
      handleStatusUpdate(invoice.invoiceHash, 'SENDING');
      
      // 2. 启动轮询（如果还没有启动）
      startPolling([invoice.invoiceHash]);
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: `cancel-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
      // ✅ 错误时清除处理状态
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  }, [executeCancel, handleError, handleStatusUpdate, startPolling]);

  // ✅ 添加：检查发票是否正在处理
  const isInvoiceProcessing = useCallback((invoiceId: string) => {
    return processingInvoiceIds.has(invoiceId);
  }, [processingInvoiceIds]);

  // ✅ 添加：检查发票是否正在同步（通过检查 metadata.confirmationStatus）
  const isInvoiceSyncing = useCallback((invoice: Invoice) => {
    return invoice.metadata?.confirmationStatus === 'SENDING';
  }, []);

  // 6. 批量同步（改进版：使用 setInvoices 重置所有发票数据）
  const handleSyncAll = useCallback(async () => {
    if (!publicKey || !masterKey) {
      toast.error('Unable to sync', {
        description: 'Missing required data'
      });
      return;
    }

    setIsSyncing(true);
    try {
      toast.loading('Syncing all invoices...', { id: 'sync-all' });
      
      // ✅ 使用按 invoice_id 去重的扫描函数
      const { byInvoiceId: invoiceRecordsByInvoiceId } = await scanAllInvoiceRecords();
      const paymentRecords = await scanAllPaymentRecords();
      
      const statusValidator = new InvoiceStatusValidator();
      
      // ✅ 重新构建完整的发票列表（使用链上数据）
      const syncedInvoices: Invoice[] = [];
      const processedInvoiceIds = new Set<string>();
      const newStatusMap = new Map<AleoField, ChainConfirmationStatus>();
      
      // 1. 先处理 PaymentRecord（优先级更高）
      for (const [invoiceId, paymentRecord] of paymentRecords.entries()) {
        try {
          // 查找本地发票
          const localInvoice = invoices.find(inv => {
            const cleanLocalId = cleanAleoField(inv.id);
            const cleanRecordId = cleanAleoField(invoiceId);
            return cleanLocalId === cleanRecordId;
          });
          
          if (localInvoice) {
            const validation = statusValidator.validateRecord(
              paymentRecord,
              localInvoice.metadata?.action,
              localInvoice.status
            );
            
            if (validation.shouldConfirm) {
              const updatedInvoice = updateInvoiceFromPaymentRecord(localInvoice, paymentRecord);
              syncedInvoices.push({
                ...localInvoice,
                ...updatedInvoice,
                metadata: {
                  confirmationStatus: 'CONFIRMED',
                  dataSource: 'chain',
                  action: localInvoice.metadata?.action
                }
              } as Invoice);
              newStatusMap.set(localInvoice.invoiceHash, 'CONFIRMED');
              processedInvoiceIds.add(invoiceId);
            }
          }
        } catch (error) {
          console.error(`Failed to process payment record ${invoiceId}:`, error);
          continue;
        }
      }
      
      // 2. 处理 InvoiceRecord（没有 PaymentRecord 的）
      for (const [invoiceId, invoiceRecordData] of invoiceRecordsByInvoiceId.entries()) {
        if (processedInvoiceIds.has(invoiceId)) {
          continue; // 已经处理过了
        }
        
        try {
          const localInvoice = invoices.find(inv => {
            const cleanLocalId = cleanAleoField(inv.id);
            const cleanRecordId = cleanAleoField(invoiceId);
            return cleanLocalId === cleanRecordId;
          });
          
          if (localInvoice) {
            const validation = statusValidator.validateRecord(
              invoiceRecordData.record,
              localInvoice.metadata?.action,
              localInvoice.status
            );
            
            if (validation.shouldConfirm) {
              const updatedInvoice = updateInvoiceFromInvoiceRecord(localInvoice, invoiceRecordData.record);
              syncedInvoices.push({
                ...localInvoice,
                ...updatedInvoice,
                metadata: {
                  confirmationStatus: 'CONFIRMED',
                  dataSource: 'chain',
                  action: localInvoice.metadata?.action
                }
              } as Invoice);
              newStatusMap.set(localInvoice.invoiceHash, 'CONFIRMED');
            }
          } else {
            // ✅ 新发票：从链上构建
            const invoice = buildInvoiceFromRecord(
              invoiceRecordData.record,
              invoiceRecordData.invoiceHash as AleoField
            );
            
            if (invoiceRecordData.record.originalInvoiceId) {
              invoice.id = invoiceRecordData.record.originalInvoiceId as AleoField;
            }
            
            syncedInvoices.push({
              ...invoice,
              metadata: {
                confirmationStatus: 'CONFIRMED',
                dataSource: 'chain'
              }
            } as Invoice);
            newStatusMap.set(invoice.invoiceHash, 'CONFIRMED');
          }
        } catch (error) {
          console.error(`Failed to process invoice ${invoiceId}:`, error);
          continue;
        }
      }
      
      // ✅ 使用 setInvoices 重置所有发票数据
      if (syncedInvoices.length > 0) {
        await setInvoices(syncedInvoices, {
          masterKey,
          persistFull: true,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            lastUpdated: new Date(),
            dataSource: 'chain'
          }
        });
      }
      
      setChainStatusMap(newStatusMap as Map<AleoField, ChainConfirmationStatus>);
      
      toast.success('Batch sync successful', {
        id: 'sync-all',
        description: `Synced ${syncedInvoices.length} invoice(s) from chain`
      });
    } catch (error) {
      console.error('Failed to sync all invoices:', error);
      toast.error('Sync failed', {
        id: 'sync-all',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSyncing(false);
    }
  }, [publicKey, masterKey, invoices, chainStatusMap, setChainStatusMap, setInvoices, scanAllInvoiceRecords, scanAllPaymentRecords]);

  // 自动初始化
  useEffect(() => {
    if (publicKey && wallet?.connected && masterKey) {
      initialize();
    }
    
    return () => {
      stopPolling();
    };
  }, [publicKey, wallet?.connected, masterKey, initialize, stopPolling]);

  /**
   * ✅ 统一的状态判断逻辑（与详情页一致）
   */
  const showLoading = useMemo(() => isLoading, [isLoading]);
  const showWalletPrompt = useMemo(() => {
    return !isLoading && !publicKey;
  }, [isLoading, publicKey]);
  const showMainContent = useMemo(() => {
    return !isLoading && invoices.length >= 0;
  }, [isLoading, invoices.length]);

  return {
    filteredInvoices,
    filter,
    search,
    isLoading,
    isSyncing,
    showLoading,
    showWalletPrompt,
    showMainContent,
    setFilter,
    setSearch,
    refresh: initialize,
    handleSyncAll,
    handlePay,
    handleCancel,
    // ✅ 添加：导出状态检查函数
    isInvoiceProcessing,
    isInvoiceSyncing
  };
}
