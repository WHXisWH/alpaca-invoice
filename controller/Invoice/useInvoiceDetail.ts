import { useMemo } from 'react';
import { useInvoiceData } from './useInvoiceData';
import { useInvoiceRole } from './useInvoiceRole';
import { useInvoiceChainSync } from './useInvoiceChainSync';
import { useInvoiceActions } from './useInvoiceActions';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { getStatusConfig } from '@/lib/invoice';
import { IInvoiceDetail } from './IInvoiceDetail';
import { AleoField, InvoiceStatus } from '@/lib/types';
import type { InvoiceState } from '@/stores/Invoice/InvoiceState';

/**
 * useInvoiceDetail Hook
 * Implements detail viewing and record reconciliation.
 *
 * Polling architecture:
 * - Auto polling: managed globally by InvoiceAutoPoller (listens to sendingInvoiceHashes)
 * - Manual sync: provided by useInvoiceChainSync (handleSyncStatus)
 * - Status display: isSyncing is derived from sendingInvoiceHashes
 *
 * This hook composes sub-hooks:
 * - useInvoiceData: load invoice data
 * - useInvoiceRole: determine user role
 * - useInvoiceChainSync: manual sync logic
 * - useInvoiceActions: pay / cancel actions
 * - useInvoiceStore: subscribe to global SENDING state
 */
export function useInvoiceDetail(invoiceHash: AleoField | null): IInvoiceDetail {
  // 1. Data loading
  const { 
    invoice, 
    isLoading: isLoadingInvoice, 
    confirmationStatus
  } = useInvoiceData(invoiceHash);
  
  // 2. User role
  const userRole = useInvoiceRole(invoice);
  
  // 3. Status configuration
  const statusConfig = useMemo(() => {
    return invoice ? getStatusConfig(invoice.status) : getStatusConfig(InvoiceStatus.PENDING);
  }, [invoice]);
  
  // 4. Subscribe to global SENDING state to derive isSyncing
  const sendingInvoiceHashes = useInvoiceStore(
    (state: InvoiceState) => state.sendingInvoiceHashes
  );
  const isSyncing = useMemo(() => {
    return invoiceHash ? sendingInvoiceHashes[invoiceHash] === true : false;
  }, [invoiceHash, sendingInvoiceHashes]);
  
  // 5. Manual sync helpers (auto polling handled globally)
  const {
    isSyncingStatus,
    handleSyncStatus
  } = useInvoiceChainSync(
    invoice, 
    invoiceHash, 
    confirmationStatus
  );
  
  // 6. Actions (pay/cancel mark SENDING; AutoPoller handles polling)
  const {
    isProcessing,
    handlePay,
    handleCancel
  } = useInvoiceActions(invoice);

  return {
    invoice,
    isLoadingInvoice,
    currentStatus: confirmationStatus,
    isSyncing,  // Derived from global sendingInvoiceHashes
    // isConfirmed: only true when confirmationStatus === 'CONFIRMED'
    isConfirmed: confirmationStatus === 'CONFIRMED',
    userRole,
    statusConfig,
    isProcessing,
    isSyncingStatus,
    handlePay,
    handleCancel,
    handleSyncStatus
  };
}
