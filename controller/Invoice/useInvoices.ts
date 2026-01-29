import { useMemo, useState, useEffect, useCallback } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { AleoField, Invoice, InvoiceStatus } from '@/lib/types';
import { IInvoices, InvoiceWithRole } from './IInvoices';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromPaymentRecord, updateInvoiceFromInvoiceRecord, buildInvoiceFromRecord, cleanAleoField } from '@/lib/invoice';
import { InvoiceStatusValidator } from '@/services/InvoiceStatusValidator/InvoiceStatusValidatorImpl';
import { useInvoiceListRole } from './useInvoiceListRole';
import { useInvoiceListFilter } from './useInvoiceListFilter';
import { useInvoiceListInitialize } from './useInvoiceListInitialize';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';

/**
 * StatusConfig 类型定义（导出供 UI 使用）
 */
export type { StatusConfig } from './IInvoices';

/**
 * useInvoices Hook
 * 作为组合器，组合各个子 hooks
 * 
 * 职责：
 * - 初始化加载发票数据（从 IndexedDB 或链上）
 * - 提供发票列表的过滤、搜索、分类功能
 * - 处理发票操作（支付、取消）
 * - 批量同步功能
 * 
 * 轮询架构：
 * - ✅ 自动轮询由全局 InvoiceAutoPoller 统一管理（Single Source of Truth）
 * - ✅ 用户操作后调用 markInvoiceSending，触发 AutoPoller 自动轮询
 * - ✅ 详情页使用 useInvoiceChainSync 提供手动同步功能
 */
export function useInvoices(): IInvoices {
  const wallet = useWallet();
  const { publicKey, masterKey } = useUserStore();
  const { 
    invoices, 
    updateInvoice, 
    setInvoices,
    sendingInvoiceHashes,
    markInvoiceSending,  // ✅ 新增：用于标记发票进入 SENDING 状态
    rebuildSendingIndex  // ✅ 新增：重建 sending 索引
  } = useInvoiceStore();
  const { scanAllInvoiceRecords, scanAllPaymentRecords } = useInvoiceChainScan();
  const [isSyncing, setIsSyncing] = useState(false);

  // ✅ 1. 初始化逻辑（轮询由全局 AutoPoller 管理）
  const { isLoading, initialize } = useInvoiceListInitialize();

  // ✅ 2. 角色判断（传递 sendingInvoiceHashes，在 hook 中计算 chainStatus）
  const { invoicesWithRole } = useInvoiceListRole(invoices, sendingInvoiceHashes);
  // ✅ 3. 过滤和搜索
  const { filteredInvoices, filter, search, setFilter, setSearch } = useInvoiceListFilter(invoicesWithRole);

  // ✅ 4. 发票分类逻辑（按角色和状态分类）
  const { receivedInvoices, sentInvoices, pending, complete } = useMemo(() => {
    const received: InvoiceWithRole[] = [];
    const sent: InvoiceWithRole[] = [];
    const pendingList: InvoiceWithRole[] = [];
    const completeList: InvoiceWithRole[] = [];

    filteredInvoices.forEach((item) => {
      const { invoice, role } = item;

      // 按角色分类
      if (role === 'BUYER' || role === 'BOTH') {
        received.push(item);
      }
      if (role === 'SELLER' || role === 'BOTH') {
        sent.push(item);
      }

      // 按状态分类
      if (invoice.status === InvoiceStatus.PENDING) {
        pendingList.push(item);
      }
      if (invoice.status === InvoiceStatus.PAID) {
        completeList.push(item);
      }
    });

    return {
      receivedInvoices: received,
      sentInvoices: sent,
      pending: pendingList,
      complete: completeList,
    };
  }, [filteredInvoices]);

  // ✅ 5. 操作（列表页模式：为每个 invoice 创建处理函数）
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
      
      // ✅ 清除处理状态
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
      
      toast.success('Payment submitted!', {
        id: `pay-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}... View details for status.`
      });
      
      // ✅ 标记为 SENDING（AutoPoller 会自动启动轮询）
      markInvoiceSending(invoice.invoiceHash);
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
  }, [executePay, handleError, markInvoiceSending]);

  const handleCancel = useCallback(async (invoice: Invoice) => {
    // ✅ 设置处理状态
    setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
    
    try {
      toast.loading('Cancelling invoice...', { id: `cancel-${invoice.id}` });
      const transactionId = await executeCancel(invoice);
      // ✅ executeCancel 已经通过 updateInvoice 更新了 invoice metadata 为 SENDING
      
      // ✅ 清除处理状态
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
      
      toast.success('Cancel request submitted!', { 
        id: `cancel-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}... View details for status.`
      });
      
      // ✅ 标记为 SENDING（AutoPoller 会自动启动轮询）
      markInvoiceSending(invoice.invoiceHash);
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
  }, [executeCancel, handleError, markInvoiceSending]);

  // ✅ 添加：检查发票是否正在处理
  const isInvoiceProcessing = useCallback((invoiceId: string) => {
    return processingInvoiceIds.has(invoiceId);
  }, [processingInvoiceIds]);

  // ✅ 添加：检查发票是否正在同步（Single Source of Truth）
  const isInvoiceSyncing = useCallback((invoice: Invoice) => {
    // ✅ Single Source of Truth：只检查全局索引
    return sendingInvoiceHashes[invoice.invoiceHash] === true;
  }, [sendingInvoiceHashes]);

  // ✅ 6. 批量同步（使用 setInvoices 重置所有发票数据）
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
          }
        } catch (error) {
          console.error(`Failed to process invoice ${invoiceId}:`, error);
          continue;
        }
      }
      
      // ✅ 使用 setInvoices 重置所有发票数据（自动重建 sending 索引）
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
  }, [publicKey, masterKey, invoices, setInvoices, rebuildSendingIndex, scanAllInvoiceRecords, scanAllPaymentRecords]);

  // ✅ 自动初始化
  useEffect(() => {
    // ✅ 只要有 publicKey 和钱包连接就可以初始化
    // masterKey 不是必需的，只是在需要解密 details 时才需要
    if (publicKey && wallet?.connected) {
      console.log('📋 [useInvoices] Initializing with publicKey:', publicKey);
      console.log('📋 [useInvoices] Has masterKey:', !!masterKey);
      initialize();
    }
    // ✅ 不需要清理：AutoPoller 全局管理轮询，不会随组件卸载而停止
  }, [publicKey, wallet?.connected, initialize]);
  // ✅ 移除 masterKey 的依赖，允许在没有 masterKey 时也能初始化

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
    // 数据
    filteredInvoices,
    receivedInvoices,
    sentInvoices,
    pending,
    complete,
    // 状态
    filter,
    search,
    isLoading,
    isSyncing,
    showLoading,
    showWalletPrompt,
    showMainContent,
    // 方法
    setFilter,
    setSearch,
    refresh: initialize,
    handleSyncAll,
    handlePay,
    handleCancel,
    isInvoiceProcessing,
    isInvoiceSyncing
  };
}
