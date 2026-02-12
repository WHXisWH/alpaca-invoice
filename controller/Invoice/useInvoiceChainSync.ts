import { useCallback, useState } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { AleoField, Invoice } from '@/lib/types';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { useInvoicePollingCore } from './useInvoicePollingCore';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';

/**
 * Hook: 链上手动同步逻辑（统一轮询架构版）
 * 
 * 职责：
 * - ✅ 手动同步功能（handleSyncStatus）- 用户主动触发
 * - ✅ 支持 key 迁移逻辑（create action 时）
 * - ❌ 移除自动轮询：由全局 AutoPoller 统一管理
 * 
 * 架构说明：
 * - 自动轮询：由 InvoiceAutoPoller（全局单例）统一管理
 * - isSyncing：在 useInvoiceDetail 中从 sendingInvoiceHashes 派生
 * - 本 Hook 只提供手动同步功能
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
  
  // ✅ 使用核心轮询逻辑（仅用于 buildUpdatedInvoice）
  const { buildUpdatedInvoice, fetchChainAnchors } = useInvoicePollingCore();
  const protocolService = new AleoProtocolService();
  
  const [isSyncingStatus, setIsSyncingStatus] = useState(false);

  /**
   * 确认发票并更新到 store
   * ✅ 包含 key 迁移逻辑（详情页特有）
   * ✅ 支持无 masterKey 时仅更新内存（不持久化）
   */
  const confirmInvoice = useCallback(async (
    updatedInvoice: Invoice,
    record: AleoInvoiceRecord | AleoPaymentRecord
  ) => {
    if (!invoiceHash) {
      console.warn('⚠️ [ChainSync] Missing invoiceHash');
      return;
    }

    try {
      console.log('🔄 [ChainSync] Confirming invoice:', invoiceHash, {
        hasMasterKey: !!masterKey,
        willPersist: !!masterKey
      });
      
      // ✅ 检测是否需要 key 迁移（action === 'create' 且 id 发生变化）
      const oldId = invoice?.id;
      const newId = updatedInvoice.id;
      const needsKeyMigration = invoice?.metadata?.action === 'create' && newId && newId !== oldId;
      
      if (needsKeyMigration && masterKey) {
        // ✅ Key 迁移需要 masterKey（因为要移动加密数据）
        console.log(`🔄 [ChainSync] Key migration needed for create action: ${oldId} → ${newId}`);
        
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
        // 如果没有 masterKey，只更新内存（不持久化）
        await updateInvoice(updatedInvoice.id, {
          ...updatedInvoice,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            dataSource: 'chain',
            action: invoice?.metadata?.action,
            lastUpdated: new Date()
          }
        } as any, {
          masterKey: masterKey || undefined,
          persistFull: !!masterKey  // ✅ 只有在有 masterKey 时才持久化
        });
        
        if (!masterKey) {
          console.log('💡 [ChainSync] Updated in memory only (no masterKey for persistence)');
        }
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
   * ✅ 支持无 masterKey 时仅更新内存
   */
  const rollbackInvoice = useCallback(async (rolledBackInvoice: Invoice) => {
    if (!invoiceHash) {
      return;
    }

    try {
      console.log('⚠️ [ChainSync] Rolling back invoice status due to timeout:', rolledBackInvoice.id, {
        hasMasterKey: !!masterKey
      });
      
      // ✅ 回退到 CONFIRMED 状态（保持原有的 invoice 状态不变）
      await updateInvoice(rolledBackInvoice.id, {
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain',
          action: invoice?.metadata?.action,
          lastUpdated: new Date()
        }
      } as any, {
        masterKey: masterKey || undefined,
        persistFull: !!masterKey  // ✅ 只有在有 masterKey 时才持久化
      });
      
      toast.warning('Transaction may have failed', {
        description: 'The transaction may not have been confirmed. Please try again or check the transaction status manually.',
        duration: 10000
      });
      
      if (!masterKey) {
        console.log('💡 [ChainSync] Rolled back in memory only (no masterKey for persistence)');
      } else {
        console.log('✅ [ChainSync] Status rolled back to CONFIRMED');
      }
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

      // ✅ 先查 mapping anchor，若已确认可快速返回
      const chainAnchor = await fetchChainAnchors(latestInvoice.id);
      if (chainAnchor.status !== null) {
        const updatedFromMapping: Invoice = {
          ...latestInvoice,
          status: chainAnchor.status,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            dataSource: 'chain',
            action: latestInvoice.metadata?.action,
            lastUpdated: new Date()
          }
        };
        await confirmInvoice(updatedFromMapping, {} as any);
        toast.success('Status refreshed from on-chain mapping', { id: 'sync-status' });
        return;
      }

      // ✅ 否则使用 useInvoiceChainScan 扫描链上记录
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

  // ✅ 移除自动轮询逻辑：由全局 AutoPoller 统一管理
  // ✅ 移除 startPolling/stopPolling：不再需要详情页独立轮询

  return {
    isSyncingStatus,
    handleSyncStatus
    // ✅ 移除 isSyncing：在 useInvoiceDetail 中从 sendingInvoiceHashes 派生
    // ✅ 移除 startPolling/stopPolling：由 AutoPoller 统一管理
  };
}
