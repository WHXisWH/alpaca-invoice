import { useCallback, useRef, useState, useEffect } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { AleoField, Invoice } from '@/lib/types';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { PollingService } from '@/services/PollingService/PollingServiceImpl';
import { InvoiceScanResult } from '@/services/PollingService/adapters/InvoiceStatusValidatorAdapter';
import { useInvoicePollingCore } from './useInvoicePollingCore';

/**
 * Hook: 链上同步逻辑（重构版）
 * 
 * 职责：
 * - 单个发票的轮询和同步
 * - 手动同步功能（handleSyncStatus）
 * - 支持 key 迁移逻辑（create action 时）
 * - 自动启动/停止轮询
 * 
 * 重构说明：
 * - 使用 useInvoicePollingCore 复用核心轮询逻辑
 * - 保留详情页特有的功能（key 迁移、手动同步）
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
  
  // ✅ 使用核心轮询逻辑
  const { createPollingService, buildUpdatedInvoice } = useInvoicePollingCore();
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
   * 确认发票并更新到 store
   * ✅ 包含 key 迁移逻辑（详情页特有）
   */
  const confirmInvoice = useCallback(async (
    updatedInvoice: Invoice,
    record: AleoInvoiceRecord | AleoPaymentRecord
  ) => {
    if (!invoiceHash || !masterKey) {
      console.warn('⚠️ [ChainSync] Missing required data', { invoiceHash, masterKey: !!masterKey });
      return;
    }

    try {
      console.log('🔄 [ChainSync] Confirming invoice:', invoiceHash);
      
      // ✅ 检测是否需要 key 迁移（action === 'create' 且 id 发生变化）
      const oldId = invoice?.id;
      const newId = updatedInvoice.id;
      const needsKeyMigration = invoice?.metadata?.action === 'create' && newId && newId !== oldId;
      
      if (needsKeyMigration) {
        console.log(`🔄 [ChainSync] Key migration needed for create action: ${oldId} → ${newId}`);
        
        // ✅ 使用 store 的 migrateInvoiceKey 方法
        await useNewInvoiceStore.getState().migrateInvoiceKey(
          oldId!,
          newId,
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
        
        console.log('✅ [ChainSync] Key migration completed', {
          invoiceHash,
          oldId,
          newId,
          status: updatedInvoice.status
        });
      } else {
        // ✅ 常规更新流程（非 create action 或 id 未变化）
        await updateInvoice(updatedInvoice.id, {
          ...updatedInvoice,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            dataSource: 'chain',
            action: invoice?.metadata?.action,
            lastUpdated: new Date()
          }
        } as any, {
          masterKey: masterKey,
          persistFull: true
        });
      }

      console.log('✅ [ChainSync] Invoice confirmed and synced to IndexedDB', {
        invoiceHash,
        invoiceId: updatedInvoice.id,
        status: updatedInvoice.status
      });
    } catch (error) {
      console.error('❌ [ChainSync] Failed to confirm invoice:', error);
      handleError(error as Error);
    }
  }, [invoice, invoiceHash, masterKey, updateInvoice, handleError]);

  /**
   * 回退状态并更新到 store
   */
  const rollbackInvoice = useCallback(async (rolledBackInvoice: Invoice) => {
    if (!invoiceHash || !masterKey) {
      return;
    }

    try {
      console.log('⚠️ [ChainSync] Rolling back invoice status due to timeout:', rolledBackInvoice.id);
      
      // ✅ 回退到 CONFIRMED 状态（保持原有的 invoice 状态不变）
      await updateInvoice(rolledBackInvoice.id, {
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain',
          action: invoice?.metadata?.action,
          lastUpdated: new Date()
        }
      } as any, {
        masterKey: masterKey,
        persistFull: true
      });
      
      toast.warning('Transaction may have failed', {
        description: 'The transaction may not have been confirmed. Please try again or check the transaction status manually.',
        duration: 10000
      });
      
      console.log('✅ [ChainSync] Status rolled back to CONFIRMED');
    } catch (error) {
      console.error('❌ [ChainSync] Failed to rollback status:', error);
      handleError(error as Error);
    }
  }, [invoice, invoiceHash, masterKey, updateInvoice, handleError]);

  /**
   * 手动同步发票状态（从链上获取最新 record）
   * ✅ 详情页特有功能
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
      console.log('🔄 [ChainSync] Starting manual sync for invoice:', latestInvoice.id);
      toast.loading('Syncing status...', { id: 'sync-status' });

      // ✅ 使用 useInvoiceChainScan 扫描链上记录
      const { invoiceRecord, paymentRecord } = await scanInvoiceRecord(invoiceHash, latestInvoice.id);

      if (!invoiceRecord && !paymentRecord) {
        toast.error('No matching on-chain record found', { id: 'sync-status' });
        return;
      }

      // ✅ 使用核心逻辑构建更新后的 invoice
      const recordToUse = paymentRecord || invoiceRecord!;
      const updatedInvoice = buildUpdatedInvoice(latestInvoice, recordToUse);

      // ✅ 确认发票（包含 key 迁移逻辑）
      await confirmInvoice(updatedInvoice, recordToUse);
      
      toast.success('Status sync successful', { id: 'sync-status' });
    } catch (error) {
      console.error('❌ [ChainSync] Failed to sync status:', error);
      toast.error('Sync failed', {
        id: 'sync-status',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      handleError(error as Error);
    } finally {
      setIsSyncingStatus(false);
    }
  }, [invoiceHash, masterKey, publicKey, scanInvoiceRecord, buildUpdatedInvoice, confirmInvoice, handleError]);

  /**
   * 停止轮询
   */
  const stopPolling = useCallback(() => {
    if (pollingServiceRef.current) {
      pollingServiceRef.current.stop();
      pollingServiceRef.current = null;
      setIsSyncing(false);
      console.log('⏹️ [ChainSync] Stopped polling');
    }
  }, []);

  /**
   * 开始轮询扫描
   * ✅ 使用核心逻辑创建 PollingService
   */
  const startPolling = useCallback(() => {
    // ✅ 使用 ref 读取最新值
    if (!invoiceHash || currentStatusRef.current === 'CONFIRMED') {
      console.log('⏭️ [ChainSync] Skipping - already confirmed or no hash', { 
        invoiceHash, 
        currentStatus: currentStatusRef.current 
      });
      return;
    }

    // ✅ 如果 invoice 还未加载，等待加载完成
    if (!invoice) {
      console.log('⏳ [ChainSync] Waiting for invoice to load...', { invoiceHash });
      return;
    }

    // ✅ 停止之前的轮询（如果存在）
    if (pollingServiceRef.current) {
      pollingServiceRef.current.stop();
    }

    setIsSyncing(true);
    console.log('🔄 [ChainSync] Starting to poll chain records for invoice:', invoiceHash);

    // ✅ 使用核心逻辑创建 PollingService
    pollingServiceRef.current = createPollingService(invoiceHash, invoice, {
      onSuccess: async (updatedInvoice, record) => {
        await confirmInvoice(updatedInvoice, record);
        setIsSyncing(false);
      },
      onTimeout: async (rolledBackInvoice) => {
        await rollbackInvoice(rolledBackInvoice);
        setIsSyncing(false);
      },
      onError: (error) => {
        console.error('[ChainSync] Polling error:', error);
      }
    });

    pollingServiceRef.current.start();
  }, [invoiceHash, invoice, createPollingService, confirmInvoice, rollbackInvoice]);

  /**
   * 自动开始/停止轮询
   */
  useEffect(() => {
    console.log('🔄 [ChainSync] Status changed:', { 
      invoiceHash, 
      currentStatus, 
      hasInvoice: !!invoice 
    });
    
    // ✅ 只有当 invoice 存在且 currentStatus 不是 null 且不是 'CONFIRMED' 时才启动轮询
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
