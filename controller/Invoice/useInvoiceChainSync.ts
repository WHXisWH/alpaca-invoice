import { useCallback, useState } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useReceiptStore } from '@/stores/Receipt/useReceiptStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { AleoField, Invoice } from '@/lib/types';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { useInvoicePollingCore } from './useInvoicePollingCore';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';

/**
 * Hook: manual on-chain sync (shared polling architecture)
 *
 * Responsibilities:
 * - Expose manual sync (handleSyncStatus) triggered by the user
 * - Support key-migration flow during create action
 * - Leave auto polling to the global InvoiceAutoPoller
 *
 * Notes:
 * - Auto polling: managed by InvoiceAutoPoller (global singleton)
 * - isSyncing: derived in useInvoiceDetail from sendingInvoiceHashes
 * - This hook only provides manual sync helpers
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
  
  // Use shared polling core (only for buildUpdatedInvoice / mapping lookup)
  const { buildUpdatedInvoice, fetchChainAnchors } = useInvoicePollingCore();
  const protocolService = new AleoProtocolService();
  
  const [isSyncingStatus, setIsSyncingStatus] = useState(false);

  /**
   * Confirm invoice and persist to the store.
   * - Handles key-migration logic for the create action.
   * - Supports memory-only updates when masterKey is unavailable.
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
      
      // Detect whether key migration is needed (create action and id changed)
      const oldId = invoice?.id;
      const newId = updatedInvoice.id;
      const needsKeyMigration = invoice?.metadata?.action === 'create' && newId && newId !== oldId;
      
      if (needsKeyMigration && masterKey) {
        // Key migration requires masterKey because encrypted data must be moved
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
        // Regular update flow (no create key migration)
        // If no masterKey, update memory only (skip persistence)
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
          persistFull: !!masterKey  // Persist only when masterKey is available
        });
        
        if (!masterKey) {
          console.log('💡 [ChainSync] Updated in memory only (no masterKey for persistence)');
        }
      }

      // Wave 3: 若为 PaymentRecord 且含 settlement_anchor，回写至 ReceiptStore 供审计 Step 2 使用
      if (record && 'payment_id' in record && (record as AleoPaymentRecord).settlement_anchor) {
        const anchor = String((record as AleoPaymentRecord).settlement_anchor).replace(/field\.(private|public)$/i, 'field');
        useReceiptStore.getState().updateReceipt(updatedInvoice.id, {
          settlementAnchor: anchor as AleoField
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
   * Roll back status and update the store.
   * Supports memory-only rollback when masterKey is absent.
   */
  const rollbackInvoice = useCallback(async (rolledBackInvoice: Invoice) => {
    if (!invoiceHash) {
      return;
    }

    try {
      console.log('⚠️ [ChainSync] Rolling back invoice status due to timeout:', rolledBackInvoice.id, {
        hasMasterKey: !!masterKey
      });
      
      // Roll back to CONFIRMED while keeping the original invoice fields intact
      await updateInvoice(rolledBackInvoice.id, {
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain',
          action: invoice?.metadata?.action,
          lastUpdated: new Date()
        }
      } as any, {
        masterKey: masterKey || undefined,
        persistFull: !!masterKey  // Persist only when masterKey is available
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
   * Manually sync invoice status by fetching the latest record on-chain
   * (used by the invoice detail page)
   */
  const handleSyncStatus = useCallback(async () => {
    // Always pull the latest invoice from the store to avoid stale closures
    const state = useNewInvoiceStore.getState();
    const latestInvoice =
      state.currentInvoice || state.invoices.find((inv: Invoice) => inv.invoiceHash === invoiceHash);
    
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

      // Fast path: check mapping anchor first; if confirmed, short-circuit
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

      // Otherwise, scan on-chain records via useInvoiceChainScan
      const { invoiceRecord, paymentRecord } = await scanInvoiceRecord(invoiceHash, latestInvoice.id);

      if (!invoiceRecord && !paymentRecord) {
        toast.error('No matching on-chain record found', { id: 'sync-status' });
        return;
      }

      // Build updated invoice using shared core logic
      const recordToUse = paymentRecord || invoiceRecord!;
      const updatedInvoice = buildUpdatedInvoice(latestInvoice, recordToUse);

      // Confirm invoice (includes key-migration handling)
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

  return {
    isSyncingStatus,
    handleSyncStatus
  };
}
