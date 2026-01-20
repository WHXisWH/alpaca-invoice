import { useCallback, useRef, useState, useEffect } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { AleoField, Invoice, InvoiceStatus } from '@/lib/types';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromPaymentRecord, updateInvoiceFromInvoiceRecord } from '@/lib/invoice';
import { cleanAleoNumber } from '@/lib/utils';

const POLL_INTERVAL = 15000; // 15秒
const POLL_TIMEOUT = 600000; // 10分钟超时

/**
 * Hook: 链上同步逻辑
 * 
 * 职责：
 * - 扫描链上记录（InvoiceRecord 和 PaymentRecord）
 * - 确认发票（更新本地状态为 CONFIRMED）
 * - 手动同步状态
 * - 自动轮询机制
 */
export function useInvoiceChainSync(
  invoice: Invoice | null,
  invoiceHash: AleoField | null,
  currentStatus: ChainConfirmationStatus | null
) {
  const { masterKey, publicKey } = useUserStore();
  const { updateInvoice } = useNewInvoiceStore();
  const { handleError } = useErrorHandler();
  const { scanInvoiceRecord } = useInvoiceChainScan();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingStatus, setIsSyncingStatus] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number | null>(null); // ✅ 新增：记录轮询开始时间
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // ✅ 新增：超时定时器
  // ✅ 使用 ref 来跟踪最新的 currentStatus，确保在异步回调中能读取到最新值
  const currentStatusRef = useRef<ChainConfirmationStatus | null>(currentStatus);
  
  // ✅ 每次 currentStatus 变化时更新 ref
  useEffect(() => {
    currentStatusRef.current = currentStatus;
  }, [currentStatus]);

  /**
   * 获取状态标签
   */
  const getStatusLabel = useCallback((status: number): string => {
    switch (status) {
      case 0: return 'Pending';
      case 1: return 'Paid';
      case 2: return 'Cancelled';
      case 3: return 'Expired';
      default: return 'Unknown';
    }
  }, []);

  /**
   * 更新发票状态为已确认，并同步到IndexedDB
   * ✅ 使用公共函数构建更新数据
   */
  const confirmInvoice = useCallback(async (
    record: AleoInvoiceRecord | AleoPaymentRecord
  ) => {
    if (!invoiceHash || !invoice || !masterKey) {
      console.warn('⚠️ [confirmInvoice] Missing required data', { invoiceHash, invoice: !!invoice, masterKey: !!masterKey });
      return;
    }

    try {
      console.log('🔄 [confirmInvoice] Confirming invoice:', invoiceHash);
      
      let updatedInvoice: Partial<Invoice>;
      const isPaymentRecord = 'payment_id' in record;

      if (isPaymentRecord) {
        // ✅ 使用公共函数从 PaymentRecord 更新
        updatedInvoice = updateInvoiceFromPaymentRecord(invoice, record as AleoPaymentRecord);
        console.log('✅ [confirmInvoice] Updated from PaymentRecord - Status: PAID');
      } else {
        // ✅ 使用公共函数从 InvoiceRecord 更新
        updatedInvoice = updateInvoiceFromInvoiceRecord(invoice, record as AleoInvoiceRecord);
        console.log(`✅ [confirmInvoice] Updated from InvoiceRecord - Status: ${getStatusLabel(updatedInvoice.status as number)}`);
      }
      
      // ✅ 更新 Store（会自动同步到 IndexedDB，包括 metadata 更新为 CONFIRMED）
      // updateInvoice 会自动更新 currentInvoice，useInvoiceData 会通过 zustand 订阅自动响应
      console.log('updatedInvoice', updatedInvoice)
      await updateInvoice(invoice.id, {
        ...updatedInvoice,
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain'
        }
      } as any, {
        masterKey: masterKey,
        persistFull: true
      });

      console.log('✅ Invoice confirmed and synced to IndexedDB', {
        invoiceHash,
        invoiceId: updatedInvoice.id,
        status: updatedInvoice.status
      });
    } catch (error) {
      console.error('Failed to confirm invoice:', error);
      handleError(error as Error);
    }
  }, [invoiceHash, invoice, masterKey, updateInvoice, handleError, getStatusLabel]);

  /**
   * 手动同步发票状态（从链上获取最新 record）
   * ✅ 使用公共函数和 useInvoiceChainScan
   */
  const handleSyncStatus = useCallback(async () => {
    if (!invoice || !invoiceHash || !masterKey || !publicKey) {
      toast.error('Unable to sync', {
        description: 'Missing required data'
      });
      return;
    }

    setIsSyncingStatus(true);
    try {
      console.log('🔄 [handleSyncStatus] Starting manual sync for invoice:', invoice.id);
      toast.loading('Syncing status...', { id: 'sync-status' });

      // ✅ 使用 useInvoiceChainScan 扫描链上记录
      // scanInvoiceRecord 已经会返回 spent 为 false 的 record（如果有多个相同 invoice id 的 record）
      const { invoiceRecord, paymentRecord } = await scanInvoiceRecord(invoiceHash, invoice.id);
      // PaymentRecord 优先，如果没有则使用 InvoiceRecord
      // ✅ 这些 record 已经是 spent 为 false 的（scanInvoiceRecord 已经筛选过）
      const recordToUse = paymentRecord || invoiceRecord;
      const recordType = paymentRecord ? 'payment' : 'invoice';

      if (!recordToUse) {
        toast.error('No matching on-chain record found', { id: 'sync-status' });
        return;
      }

      console.log(`🔄 [handleSyncStatus] Updating with ${recordType} record (unspent)`);

      let updatedInvoice: Partial<Invoice>;

      if (paymentRecord) {
        updatedInvoice = updateInvoiceFromPaymentRecord(invoice, paymentRecord);
        console.log('✅ [handleSyncStatus] Updated from PaymentRecord - Status: PAID');
      } else if (invoiceRecord) {
        updatedInvoice = updateInvoiceFromInvoiceRecord(invoice, invoiceRecord);
        console.log(`✅ [handleSyncStatus] Updated from InvoiceRecord - Status: ${getStatusLabel(updatedInvoice.status as number)}`);
      } else {
        toast.error('Invalid record type', { id: 'sync-status' });
        return;
      }
      console.log('updatedInvoice', updatedInvoice)
      
      // ✅ 更新 Store
      // updateInvoice 会自动更新 currentInvoice，useInvoiceData 会通过 zustand 订阅自动响应
      await updateInvoice(invoice.id, {
        ...updatedInvoice,
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain'
        }
      } as any, {
        masterKey: masterKey || undefined,
        persistFull: true
      });

      toast.success('Status sync successful', {
        id: 'sync-status',
        description: recordType === 'payment' 
          ? '✅ Paid (Payment Record)' 
          : `${getStatusLabel(updatedInvoice.status as number)}`
      });

      console.log('✅ [handleSyncStatus] Sync completed successfully');
    } catch (error) {
      console.error('Failed to sync status:', error);
      toast.error('Sync failed', {
        id: 'sync-status',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      handleError(error as Error);
    } finally {
      setIsSyncingStatus(false);
    }
  }, [invoice, invoiceHash, masterKey, publicKey, scanInvoiceRecord, updateInvoice, handleError, getStatusLabel]);

  /**
   * 回退状态：当轮询超时或交易失败时，将状态回退到 CONFIRMED
   */
  const rollbackStatus = useCallback(async () => {
    if (!invoice || !invoiceHash || !masterKey) {
      return;
    }

    try {
      console.log('⚠️ [rollbackStatus] Rolling back invoice status due to timeout or failure:', invoice.id);
      
      // ✅ 回退到 CONFIRMED 状态（保持原有的 invoice 状态不变）
      // updateInvoice 会自动更新 currentInvoice，useInvoiceData 会通过 zustand 订阅自动响应
      await updateInvoice(invoice.id, {
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain'
        }
      } as any, {
        masterKey: masterKey,
        persistFull: true
      });
      
      toast.warning('Transaction may have failed', {
        description: 'The cancellation transaction may not have been confirmed. Please try again or check the transaction status manually.',
        duration: 10000
      });
      
      console.log('✅ [rollbackStatus] Status rolled back to CONFIRMED');
    } catch (error) {
      console.error('❌ [rollbackStatus] Failed to rollback status:', error);
      handleError(error as Error);
    }
  }, [invoice, invoiceHash, masterKey, updateInvoice, handleError]);

  /**
   * 停止轮询
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    // ✅ 清除超时定时器
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    
    pollingStartTimeRef.current = null;
    setIsSyncing(false);
    console.log('⏹️ Stopped polling chain records');
  }, []);

  /**
   * 开始轮询扫描
   */
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      return; // 已经在轮询
    }

    // ✅ 使用 ref 读取最新值
    if (!invoiceHash || currentStatusRef.current === 'CONFIRMED') {
      console.log('⏭️ [startPolling] Skipping - already confirmed or no hash', { invoiceHash, currentStatus: currentStatusRef.current });
      return; // 不需要轮询
    }

    // ✅ 如果 invoice 还未加载，等待加载完成
    if (!invoice) {
      console.log('⏳ [startPolling] Waiting for invoice to load...', { invoiceHash });
      return; // 等待 invoice 加载完成
    }

    setIsSyncing(true);
    pollingStartTimeRef.current = Date.now(); // ✅ 记录开始时间
    console.log('🔄 Starting to poll chain records for invoice:', invoiceHash);

    // ✅ 保存当前发票的原始状态和 action，用于判断是否在等待特定操作确认
    const originalInvoiceStatus = invoice.status;
    const currentAction = invoice.metadata?.action; // ✅ 获取当前操作类型

    // ✅ 检查 record 是否符合预期状态的辅助函数
    const shouldConfirmRecord = (record: AleoInvoiceRecord | AleoPaymentRecord | null): boolean => {
      if (!record) return false;
      
      // PaymentRecord 总是可以确认（表示已支付）
      if ('payment_id' in record) {
        // ✅ 如果是支付操作，找到 PaymentRecord 就可以确认
        if (currentAction === 'pay') {
          return true;
        }
        // ✅ 其他情况（如创建发票后意外找到 PaymentRecord）也可以确认
        return true;
      }
      
      // InvoiceRecord 需要根据 action 检查 status
      const invoiceRecord = record as AleoInvoiceRecord;
      const recordStatus = Number(cleanAleoNumber(invoiceRecord.status));
      
      // ✅ 根据 action 类型判断
      if (currentAction === 'cancel') {
        // 取消操作：必须等待 status 变为 CANCELLED (2)
        if (recordStatus === InvoiceStatus.CANCELLED) {
          console.log('✅ [startPolling] Found CANCELLED record for cancel action, confirming...');
          return true;
        } else {
          console.log('⏳ [startPolling] Found record but status is not CANCELLED yet, continuing to poll...', { 
            currentStatus: recordStatus, 
            expectedStatus: InvoiceStatus.CANCELLED 
          });
          return false; // 继续轮询，等待状态变为 CANCELLED
        }
      } else if (currentAction === 'create') {
        // 创建操作：找到 PENDING 状态的 record 就可以确认（只是确认发票存在）
        if (recordStatus === InvoiceStatus.PENDING) {
          console.log('✅ [startPolling] Found PENDING record for create action, confirming...');
          return true;
        } else {
          // 如果状态已经变化（如已支付、已取消），也可以确认
          console.log('✅ [startPolling] Found record with changed status for create action, confirming...', { status: recordStatus });
          return true;
        }
      } else if (currentAction === 'pay') {
        // 支付操作：应该找到 PaymentRecord，但如果找到 InvoiceRecord 且状态是 PAID，也可以确认
        if (recordStatus === InvoiceStatus.PAID) {
          console.log('✅ [startPolling] Found PAID record for pay action, confirming...');
          return true;
        } else {
          console.log('⏳ [startPolling] Found record but status is not PAID yet, continuing to poll...', { 
            currentStatus: recordStatus, 
            expectedStatus: InvoiceStatus.PAID 
          });
          return false; // 继续轮询，等待状态变为 PAID
        }
      } else {
        // ✅ 没有 action 或未知 action：使用原有逻辑
        // 如果当前发票状态是 PENDING，且找到的 record 状态也是 PENDING
        // 说明只是确认了发票存在，可以确认
        if (originalInvoiceStatus === InvoiceStatus.PENDING && recordStatus === InvoiceStatus.PENDING) {
          console.log('✅ [startPolling] Found PENDING record matching current status, confirming...');
          return true;
        }
        
        // 其他情况（status 已变化）也可以确认
        return true;
      }
    };

    // ✅ 设置超时定时器
    pollingTimeoutRef.current = setTimeout(() => {
      console.warn('⏰ [startPolling] Polling timeout reached, rolling back status');
      stopPolling();
      rollbackStatus();
    }, POLL_TIMEOUT);

    // 立即执行一次扫描
    scanInvoiceRecord(invoiceHash, invoice.id).then(({ invoiceRecord, paymentRecord }) => {
      // ✅ 在执行回调前使用 ref 检查状态（确保读取最新值）
      if (currentStatusRef.current === 'CONFIRMED') {
        console.log('⏭️ [startPolling] Status changed to CONFIRMED during scan, skipping callback');
        stopPolling();
        return;
      }
      
      // ✅ 选择 record（PaymentRecord 优先）
      const recordToUse = paymentRecord || invoiceRecord;
      
      // ✅ 检查 record 是否符合预期状态
      if (recordToUse && shouldConfirmRecord(recordToUse)) {
        confirmInvoice(recordToUse).then(() => {
          stopPolling();
        });
      } else if (recordToUse) {
        // 找到了 record，但状态还不符合预期，继续轮询
        console.log('⏳ [startPolling] Found record but status not yet changed, continuing to poll...');
      }
    });

    // 设置定时轮询
    pollingIntervalRef.current = setInterval(async () => {
      // ✅ 再次检查 invoice 和 currentStatus（使用 ref 读取最新值）
      const status = currentStatusRef.current;
      if (!invoice || status === 'CONFIRMED') {
        console.warn('⚠️ [startPolling] Invoice is null or already confirmed during polling, stopping...');
        stopPolling();
        return;
      }
      
      // ✅ 检查是否超时
      if (pollingStartTimeRef.current && Date.now() - pollingStartTimeRef.current > POLL_TIMEOUT) {
        console.warn('⏰ [startPolling] Polling timeout reached during interval, rolling back');
        stopPolling();
        rollbackStatus();
        return;
      }
      
      const { invoiceRecord, paymentRecord } = await scanInvoiceRecord(invoiceHash, invoice.id);
      
      // ✅ 在执行回调前再次检查状态（使用 ref 读取最新值）
      // 重新读取 ref 的值，因为它可能在异步操作过程中发生变化
      const latestStatus = currentStatusRef.current;
      if (latestStatus === 'CONFIRMED') {
        console.log('⏭️ [startPolling] Status changed to CONFIRMED during interval scan, stopping');
        stopPolling();
        return;
      }
      
      // ✅ 选择 record（PaymentRecord 优先）
      const recordToUse = paymentRecord || invoiceRecord;
      
      // ✅ 检查 record 是否符合预期状态
      if (recordToUse && shouldConfirmRecord(recordToUse)) {
        await confirmInvoice(recordToUse);
        stopPolling();
      } else if (recordToUse) {
        // 找到了 record，但状态还不符合预期，继续轮询
        console.log('⏳ [startPolling] Found record but status not yet changed, continuing to poll...');
      }
    }, POLL_INTERVAL);
  }, [invoiceHash, invoice, scanInvoiceRecord, confirmInvoice, stopPolling, rollbackStatus]); // ✅ 添加 rollbackStatus 依赖

  /**
   * 自动开始/停止轮询
   */
  useEffect(() => {
    console.log('🔄 [useInvoiceChainSync] Status changed:', { invoiceHash, currentStatus, hasInvoice: !!invoice });
    
    // ✅ 只有当 invoice 存在且 currentStatus 不是 null 且不是 'CONFIRMED' 时才启动轮询
    // 这样可以避免在 invoice 加载完成前就启动轮询，也避免在已确认时启动轮询
    if (invoiceHash && invoice && currentStatus && currentStatus !== 'CONFIRMED') {
      startPolling();
    } else {
      stopPolling();
    }

    // 清理函数
    return () => {
      stopPolling();
    };
  }, [invoiceHash, invoice, currentStatus, startPolling, stopPolling]);

  return {
    isSyncing,
    isSyncingStatus,
    handleSyncStatus,
    startPolling,
    stopPolling
  };
}

