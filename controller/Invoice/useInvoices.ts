import { useMemo, useState, useEffect, useCallback } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { AleoField, Invoice, InvoiceStatus, CurrencyFlag } from '@/lib/types';
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
 * StatusConfig type (re-exported for UI)
 */
export type { StatusConfig } from './IInvoices';

/**
 * useInvoices Hook
 * Composes sub-hooks to provide invoice list functionality.
 *
 * Responsibilities:
 * - Initialize invoice data (from IndexedDB or chain)
 * - Provide filter/search/grouping
 * - Handle pay/cancel actions
 * - Batch sync
 *
 * Polling model:
 * - Auto polling is managed by the global InvoiceAutoPoller (single source of truth)
 * - After user actions call markInvoiceSending to trigger AutoPoller
 * - Details view uses useInvoiceChainSync for manual sync
 */
export function useInvoices(): IInvoices {
  const wallet = useWallet();
  const { publicKey, masterKey } = useUserStore();
  const { 
    invoices, 
    updateInvoice, 
    setInvoices,
    sendingInvoiceHashes,
    markInvoiceSending,  // Marks invoice as SENDING (triggers AutoPoller)
    rebuildSendingIndex  // Rebuilds sending index from invoices
  } = useInvoiceStore();
  const { scanAllInvoiceRecords, scanAllPaymentRecords } = useInvoiceChainScan();
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Initialization (polling managed globally)
  const { isLoading, initialize } = useInvoiceListInitialize();

  // 2. Derive roles (chainStatus computed in hook using sendingInvoiceHashes)
  const { invoicesWithRole } = useInvoiceListRole(invoices, sendingInvoiceHashes);
  // 3. Filter and search
  const { filteredInvoices, filter, search, setFilter, setSearch } = useInvoiceListFilter(invoicesWithRole);

  // 4. Group invoices by role and status
  const { receivedInvoices, sentInvoices, pending, complete } = useMemo(() => {
    const received: InvoiceWithRole[] = [];
    const sent: InvoiceWithRole[] = [];
    const pendingList: InvoiceWithRole[] = [];
    const completeList: InvoiceWithRole[] = [];

    filteredInvoices.forEach((item) => {
      const { invoice, role } = item;

      // Group by role
      if (role === 'BUYER' || role === 'BOTH') {
        received.push(item);
      }
      if (role === 'SELLER' || role === 'BOTH') {
        sent.push(item);
      }

      // Group by status
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

  // 5. Actions for each invoice (list view)
  const { executePay, executeCancel } = useTransactionController();
  const { handleError } = useErrorHandler();
  
  // Track per-invoice processing state
  const [processingInvoiceIds, setProcessingInvoiceIds] = useState<Set<string>>(new Set());
  
  const handlePay = useCallback(async (invoice: Invoice) => {
    // Set processing flag
    setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
    
    try {
      toast.loading('Processing payment...', { id: `pay-${invoice.id}` });
      const transactionId = await executePay(invoice);
      
      // Clear processing flag
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
      
      toast.success('Payment submitted!', {
        id: `pay-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}... View details for status.`
      });
      
      // Mark as SENDING (AutoPoller will take over polling)
      markInvoiceSending(invoice.invoiceHash);
    } catch (error) {
      toast.error('Payment failed', {
        id: `pay-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
      // Clear processing flag on error
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  }, [executePay, handleError, markInvoiceSending]);

  const handleCancel = useCallback(async (invoice: Invoice) => {
    // Set processing flag
    setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
    
    try {
      toast.loading('Cancelling invoice...', { id: `cancel-${invoice.id}` });
      const transactionId = await executeCancel(invoice);
      // executeCancel already updates invoice metadata to SENDING
      
      // Clear processing flag
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
      
      toast.success('Cancel request submitted!', { 
        id: `cancel-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}... View details for status.`
      });
      
      // Mark as SENDING (AutoPoller will take over polling)
      markInvoiceSending(invoice.invoiceHash);
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: `cancel-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
      // Clear processing flag on error
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  }, [executeCancel, handleError, markInvoiceSending]);

  // Helper: check whether a given invoice is processing
  const isInvoiceProcessing = useCallback((invoiceId: string) => {
    return processingInvoiceIds.has(invoiceId);
  }, [processingInvoiceIds]);

  // Helper: check whether an invoice is syncing (single source of truth)
  const isInvoiceSyncing = useCallback((invoice: Invoice) => {
    return sendingInvoiceHashes[invoice.invoiceHash] === true;
  }, [sendingInvoiceHashes]);

  // 6. Batch sync (reset all invoices with setInvoices)
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
      
      // Scan with invoice_id de-duplication
      const { byInvoiceId: invoiceRecordsByInvoiceId } = await scanAllInvoiceRecords();
      const paymentRecords = await scanAllPaymentRecords();
      
      const statusValidator = new InvoiceStatusValidator();
      
      // Rebuild full invoice list from on-chain data
      const syncedInvoices: Invoice[] = [];
      const processedInvoiceIds = new Set<string>();
      
      // 1) Process payment records first (higher priority)
      for (const [invoiceId, paymentRecord] of paymentRecords.entries()) {
        try {
          // Find local invoice
          const localInvoice = invoices.find((inv: Invoice) => {
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
      
      // 2) Process InvoiceRecord when no PaymentRecord exists
      for (const [invoiceId, invoiceRecordData] of invoiceRecordsByInvoiceId.entries()) {
        if (processedInvoiceIds.has(invoiceId)) {
          continue; // already handled via payment record
        }
        
        try {
          const localInvoice = invoices.find((inv: Invoice) => {
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
            // New invoice: build from chain record
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
      
      // Preserve SENDING invoices (not yet on chain) so they don't get deleted
      for (const inv of invoices) {
        const cleanId = cleanAleoField(inv.id);
        const alreadySynced = syncedInvoices.some(
          (s) => cleanAleoField(s.id) === cleanId
        );
        if (!alreadySynced && inv.metadata?.confirmationStatus === 'SENDING') {
          syncedInvoices.push(inv);
        }
      }

      // Reset store with synced invoices (rebuilds sending index automatically)
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

  // Auto-initialize when wallet is connected (masterKey optional)
  useEffect(() => {
    if (publicKey && wallet?.connected) {
      console.log('📋 [useInvoices] Initializing with publicKey:', publicKey);
      console.log('📋 [useInvoices] Has masterKey:', !!masterKey);
      initialize();
    }
  }, [publicKey, wallet?.connected, initialize]);

  // Status flags (align with detail view)
  const showLoading = useMemo(() => isLoading, [isLoading]);
  const showWalletPrompt = useMemo(() => {
    return !isLoading && !publicKey;
  }, [isLoading, publicKey]);
  const showMainContent = useMemo(() => {
    return !isLoading && invoices.length >= 0;
  }, [isLoading, invoices.length]);

  // Wave 3 派生聚合数据（Dashboard）
  const totalAccountPayable = useMemo(() => {
    return receivedInvoices
      .filter((item) => item.invoice.status === InvoiceStatus.PENDING)
      .reduce((sum, item) => sum + (item.invoice.totalAmount ?? item.invoice.amount), 0n);
  }, [receivedInvoices]);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const totalPaidThisMonth = useMemo(() => {
    return complete
      .filter((item) => {
        const d = item.invoice.metadata?.lastUpdated ?? item.invoice.createdAt;
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
      })
      .reduce((sum, item) => sum + (item.invoice.totalAmount ?? item.invoice.amount), 0n);
  }, [complete, thisYear, thisMonth]);

  const jctDeductibleAmount = useMemo(() => {
    return complete
      .filter((item) => {
        const tag = item.invoice.taxTag;
        return tag != null && tag !== '0field' && tag !== '';
      })
      .reduce((sum, item) => sum + (item.invoice.taxAmount ?? 0n), 0n);
  }, [complete]);

  const currencyDistribution = useMemo(() => {
    let credits = 0n;
    let usdcx = 0n;
    complete.forEach((item) => {
      const amt = item.invoice.totalAmount ?? item.invoice.amount;
      if (item.invoice.currencyFlag === CurrencyFlag.USDCX) usdcx += amt;
      else credits += amt;
    });
    return { credits, usdcx };
  }, [complete]);

  const taxTrend = useMemo(() => {
    const months: Array<{ month: string; inputTax: bigint; outputTax: bigint }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let inputTax = 0n;
      let outputTax = 0n;
      const y = d.getFullYear();
      const m = d.getMonth();
      receivedInvoices
        .filter((item) => item.invoice.status === InvoiceStatus.PAID)
        .forEach((item) => {
          const date = item.invoice.metadata?.lastUpdated ?? item.invoice.createdAt;
          if (date.getFullYear() === y && date.getMonth() === m) {
            inputTax += item.invoice.taxAmount ?? 0n;
          }
        });
      sentInvoices
        .filter((item) => item.invoice.status === InvoiceStatus.PAID)
        .forEach((item) => {
          const date = item.invoice.metadata?.lastUpdated ?? item.invoice.createdAt;
          if (date.getFullYear() === y && date.getMonth() === m) {
            outputTax += item.invoice.taxAmount ?? 0n;
          }
        });
      months.push({ month: monthStr, inputTax, outputTax });
    }
    return months;
  }, [receivedInvoices, sentInvoices, thisYear, thisMonth]);

  return {
    // Data
    filteredInvoices,
    receivedInvoices,
    sentInvoices,
    pending,
    complete,
    // State
    filter,
    search,
    isLoading,
    isSyncing,
    showLoading,
    showWalletPrompt,
    showMainContent,
    // Methods
    setFilter,
    setSearch,
    refresh: initialize,
    handleSyncAll,
    handlePay,
    handleCancel,
    isInvoiceProcessing,
    isInvoiceSyncing,
    totalAccountPayable,
    totalPaidThisMonth,
    jctDeductibleAmount,
    currencyDistribution,
    taxTrend
  };
}
