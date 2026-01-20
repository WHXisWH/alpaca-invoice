import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { AleoField, Invoice } from '@/lib/types';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromPaymentRecord, updateInvoiceFromInvoiceRecord } from '@/lib/invoice';
import { PollingService } from '@/services/PollingService/PollingServiceImpl';
import { createInvoiceValidationAdapter, InvoiceScanResult } from '@/services/PollingService/adapters/InvoiceStatusValidatorAdapter';
import { InvoiceStatusValidator } from '@/services/InvoiceStatusValidator/InvoiceStatusValidatorImpl';

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
  
  // ✅ 使用新的服务
  const statusValidator = useMemo(() => new InvoiceStatusValidator(), []);
  const pollingServiceRef = useRef<PollingService<InvoiceScanResult> | null>(null);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingStatus, setIsSyncingStatus] = useState(false);
  // ✅ 使用 ref 来跟踪最新的 currentStatus，确保在异步回调中能读取到最新值
  const currentStatusRef = useRef<ChainConfirmationStatus | null>(currentStatus);
  
  // ✅ 每次 currentStatus 变化时更新 ref
  useEffect(() => {
    currentStatusRef.current = currentStatus;
  }, [currentStatus]);

  /**
   * 更新发票状态为已确认，并同步到IndexedDB
   * ✅ 使用公共函数构建更新数据
   */
  const confirmInvoice = useCallback(async (
    record: AleoInvoiceRecord | AleoPaymentRecord
  ) => {
    // ✅ 从 store 获取最新的 invoice，避免闭包问题
    const state = useNewInvoiceStore.getState();
    const latestInvoice = state.currentInvoice || state.invoices.find(inv => inv.invoiceHash === invoiceHash);
    
    if (!latestInvoice || !invoiceHash || !masterKey) {
      console.warn('⚠️ [confirmInvoice] Missing required data', { invoiceHash, invoice: !!latestInvoice, masterKey: !!masterKey });
      return;
    }

    try {
      console.log('🔄 [confirmInvoice] Confirming invoice:', invoiceHash);
      
      let updatedInvoice: Partial<Invoice>;
      const isPaymentRecord = 'payment_id' in record;

      if (isPaymentRecord) {
        // ✅ 使用公共函数从 PaymentRecord 更新
        updatedInvoice = updateInvoiceFromPaymentRecord(latestInvoice, record as AleoPaymentRecord);
        console.log('✅ [confirmInvoice] Updated from PaymentRecord - Status: PAID');
      } else {
        // ✅ 使用公共函数从 InvoiceRecord 更新
        updatedInvoice = updateInvoiceFromInvoiceRecord(latestInvoice, record as AleoInvoiceRecord);
        console.log(`✅ [confirmInvoice] Updated from InvoiceRecord - Status: ${updatedInvoice.status}`);
      }
      
      // ✅ 检测是否需要 key 迁移（action === 'create' 且 id 发生变化）
      const oldId = latestInvoice.id;
      const newId = updatedInvoice.id;
      const needsKeyMigration = latestInvoice.metadata?.action === 'create' && newId && newId !== oldId;
      
      if (needsKeyMigration) {
        console.log(`🔄 [confirmInvoice] Key migration needed for create action: ${oldId} → ${newId}`);
        
        // ✅ 使用 store 的 migrateInvoiceKey 方法
        await useNewInvoiceStore.getState().migrateInvoiceKey(
          oldId,
          newId!,
          {
            ...updatedInvoice,
            metadata: {
              confirmationStatus: 'CONFIRMED',
              dataSource: 'chain',
              action: 'create',
              lastUpdated: new Date()
            }
          } as any,
          {
            masterKey: masterKey,
            persistFull: true
          }
        );
        
        console.log('✅ [confirmInvoice] Key migration completed', {
          invoiceHash,
          oldId,
          newId,
          status: updatedInvoice.status
        });
      } else {
        // ✅ 常规更新流程（非 create action 或 id 未变化）
        await updateInvoice(latestInvoice.id, {
          ...updatedInvoice,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            dataSource: 'chain',
            action: latestInvoice.metadata?.action // ✅ 保持原有的 action
          }
        } as any, {
          masterKey: masterKey,
          persistFull: true
        });
      }

      console.log('✅ Invoice confirmed and synced to IndexedDB', {
        invoiceHash,
        invoiceId: updatedInvoice.id,
        status: updatedInvoice.status
      });
    } catch (error) {
      console.error('Failed to confirm invoice:', error);
      handleError(error as Error);
    }
  }, [invoiceHash, masterKey, updateInvoice, handleError]);

  /**
   * 手动同步发票状态（从链上获取最新 record）
   * ✅ 使用公共函数和 useInvoiceChainScan
   */
  const handleSyncStatus = useCallback(async () => {
    // ✅ 从 store 获取最新的 invoice，避免闭包问题
    const state = useNewInvoiceStore.getState();
    const latestInvoice = state.currentInvoice || state.invoices.find(inv => inv.invoiceHash === invoiceHash);
    
    if (!latestInvoice || !invoiceHash || !masterKey || !publicKey) {
      toast.error('Unable to sync', {
        description: 'Missing required data'
      });
      return;
    }

    setIsSyncingStatus(true);
    try {
      console.log('🔄 [handleSyncStatus] Starting manual sync for invoice:', latestInvoice.id);
      toast.loading('Syncing status...', { id: 'sync-status' });

      // ✅ 使用 useInvoiceChainScan 扫描链上记录
      const { invoiceRecord, paymentRecord } = await scanInvoiceRecord(invoiceHash, latestInvoice.id);

      if (!invoiceRecord && !paymentRecord) {
        toast.error('No matching on-chain record found', { id: 'sync-status' });
        return;
      }

      // ✅ 使用验证服务检查 record 是否符合预期状态
      const validation = statusValidator.validateRecord(
        paymentRecord || invoiceRecord,
        latestInvoice.metadata?.action,
        latestInvoice.status
      );

      if (!validation.shouldConfirm) {
        toast.warning('Status not yet confirmed', {
          id: 'sync-status',
          description: validation.reason
        });
        return;
      }

      // ✅ 符合预期，确认发票
      await confirmInvoice(paymentRecord || invoiceRecord!);
      
      toast.success('Status sync successful', { id: 'sync-status' });
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
  }, [invoiceHash, masterKey, publicKey, scanInvoiceRecord, confirmInvoice, handleError, statusValidator]);

  /**
   * 回退状态：当轮询超时或交易失败时，将状态回退到 CONFIRMED
   */
  const rollbackStatus = useCallback(async () => {
    // ✅ 从 store 获取最新的 invoice，避免闭包问题
    const state = useNewInvoiceStore.getState();
    const latestInvoice = state.currentInvoice || state.invoices.find(inv => inv.invoiceHash === invoiceHash);
    
    if (!latestInvoice || !invoiceHash || !masterKey) {
      return;
    }

    try {
      console.log('⚠️ [rollbackStatus] Rolling back invoice status due to timeout or failure:', latestInvoice.id);
      
      // ✅ 回退到 CONFIRMED 状态（保持原有的 invoice 状态不变）
      // updateInvoice 会自动更新 currentInvoice，useInvoiceData 会通过 zustand 订阅自动响应
      await updateInvoice(latestInvoice.id, {
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain',
          action: latestInvoice.metadata?.action // ✅ 保持原有的 action
        }
      } as any, {
        masterKey: masterKey,
        persistFull: true
      });
      
      toast.warning('Transaction may have failed', {
        description: 'The transaction may not have been confirmed. Please try again or check the transaction status manually.',
        duration: 10000
      });
      
      console.log('✅ [rollbackStatus] Status rolled back to CONFIRMED');
    } catch (error) {
      console.error('❌ [rollbackStatus] Failed to rollback status:', error);
      handleError(error as Error);
    }
  }, [invoiceHash, masterKey, updateInvoice, handleError]);

  /**
   * 停止轮询
   */
  const stopPolling = useCallback(() => {
    if (pollingServiceRef.current) {
      pollingServiceRef.current.stop();
      pollingServiceRef.current = null;
      setIsSyncing(false);
    }
  }, []);

  /**
   * 开始轮询扫描
   * ✅ 使用 PollingService 管理轮询生命周期
   */
  const startPolling = useCallback(() => {
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

    // ✅ 停止之前的轮询（如果存在）
    if (pollingServiceRef.current) {
      pollingServiceRef.current.stop();
    }

    // ✅ 从 store 获取最新的 invoice，避免闭包问题
    const state = useNewInvoiceStore.getState();
    const latestInvoice = state.currentInvoice || state.invoices.find(inv => inv.invoiceHash === invoiceHash);
    
    if (!latestInvoice) {
      console.warn('⚠️ [startPolling] Invoice not found in store');
      return;
    }

    setIsSyncing(true);
    console.log('🔄 [startPolling] Starting to poll chain records for invoice:', invoiceHash);

    // ✅ 创建验证适配器
    const validateAdapter = createInvoiceValidationAdapter(statusValidator, latestInvoice);

    // ✅ 创建并启动轮询服务
    pollingServiceRef.current = new PollingService<InvoiceScanResult>(
      {
        pollInterval: POLL_INTERVAL,
        pollTimeout: POLL_TIMEOUT,
        taskName: `Invoice polling (${invoiceHash.slice(0, 20)}...)`
      },
      {
        scan: async () => {
          const result = await scanInvoiceRecord(invoiceHash, latestInvoice.id);
          return {
            invoiceRecord: result.invoiceRecord,
            paymentRecord: result.paymentRecord
          };
        },
        validate: validateAdapter,
        onSuccess: async (result) => {
          const recordToUse = result.paymentRecord || result.invoiceRecord;
          if (recordToUse) {
            await confirmInvoice(recordToUse);
          }
        },
        onTimeout: rollbackStatus,
        onError: (error) => {
          console.error('[useInvoiceChainSync] Polling error:', error);
        }
      }
    );

    pollingServiceRef.current.start();
  }, [invoiceHash, invoice, currentStatus, confirmInvoice, rollbackStatus, scanInvoiceRecord, statusValidator]);

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

