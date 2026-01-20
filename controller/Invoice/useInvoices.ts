import { useMemo, useState, useEffect, useCallback } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoField, Invoice } from '@/lib/types';
import { cleanAleoNumber } from '@/lib/utils';
import { IInvoices } from './IInvoices';
import { useInvoiceChainScan } from './useInvoiceChainScan';
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
  const { invoices, updateInvoice } = useInvoiceStore();
  const { scanAllRecords } = useInvoiceChainScan();
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
  
  const handlePay = useCallback(async (invoice: Invoice) => {
    try {
      toast.loading('Processing payment...', { id: `pay-${invoice.id}` });
      const transactionId = await executePay(invoice);
      toast.success('Payment successful!', {
        id: `pay-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      await initialize();
    } catch (error) {
      toast.error('Payment failed', {
        id: `pay-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
    }
  }, [executePay, initialize, handleError]);

  const handleCancel = useCallback(async (invoice: Invoice) => {
    try {
      toast.loading('Cancelling invoice...', { id: `cancel-${invoice.id}` });
      const transactionId = await executeCancel(invoice);
      toast.success('Invoice cancelled successfully', { 
        id: `cancel-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      await initialize();
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: `cancel-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
    }
  }, [executeCancel, initialize, handleError]);

  // 6. 批量同步
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
      
      // 扫描链上 records
      const chainRecords = await scanAllRecords();
      
      let updatedCount = 0;
      const newStatusMap = new Map(chainStatusMap);
      
      for (const invoice of invoices) {
        const chainRecord = chainRecords.get(invoice.invoiceHash);
        if (chainRecord) {
          const cleanInvoiceId = chainRecord.invoice_id?.replace(/field\.(private|public)$/, 'field') as AleoField;
          const cleanAmount = cleanAleoNumber(chainRecord.amount);
          const cleanDueDate = cleanAleoNumber(chainRecord.due_date);
          const cleanCreatedAt = cleanAleoNumber(chainRecord.created_at);
          const cleanStatus = cleanAleoNumber(chainRecord.status);

          await updateInvoice(invoice.id, {
            id: cleanInvoiceId,
            invoiceHash: invoice.invoiceHash,
            seller: chainRecord.seller as any,
            buyer: chainRecord.buyer as any,
            amount: BigInt(cleanAmount) as any,
            dueDate: new Date(Number(cleanDueDate) * 1000),
            createdAt: new Date(Number(cleanCreatedAt) * 1000),
            status: Number(cleanStatus) as any,
            metadata: {
              confirmationStatus: 'CONFIRMED',
              dataSource: 'chain'
            }
          } as any, {
            masterKey,
            persistFull: true
          });
          
          newStatusMap.set(invoice.invoiceHash, 'CONFIRMED');
          updatedCount++;
        }
      }
      
      setChainStatusMap(newStatusMap as Map<AleoField, ChainConfirmationStatus>);
      
      toast.success('Batch sync successful', {
        id: 'sync-all',
        description: `Updated ${updatedCount} invoice(s) from chain`
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
  }, [publicKey, masterKey, invoices, scanAllRecords, updateInvoice, chainStatusMap, setChainStatusMap]);

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
    handleCancel
  };
}
