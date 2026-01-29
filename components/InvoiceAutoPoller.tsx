'use client';

import { useEffect, useRef } from 'react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useInvoiceListPolling } from '@/controller/Invoice/useInvoiceListPolling';
import { AleoField, Invoice } from '@/lib/types';

/**
 * InvoiceAutoPoller - Global automatic polling component
 *
 * Responsibilities:
 * - Listens to sendingInvoiceHashes in the store
 * - Automatically starts polling when new SENDING invoices are detected
 * - Automatically updates the store after polling completes (removes SENDING status)
 *
 * Features:
 * - Global singleton: placed in app/(app)/layout.tsx to ensure only one instance runs
 * - Auto-responsive: automatically starts polling regardless of which page triggers markInvoiceSending
 * - Cross-page sync: all pages share the same polling state
 */
export function InvoiceAutoPoller() {
  const sendingInvoiceHashes = useInvoiceStore((state) => state.sendingInvoiceHashes);
  const markInvoiceConfirmed = useInvoiceStore((state) => state.markInvoiceConfirmed);
  const updateInvoice = useInvoiceStore((state) => state.updateInvoice);
  
  // Use ref to track invoices that have already started polling (to avoid duplicate starts)
  const pollingHashesRef = useRef<Set<AleoField>>(new Set());

  // Polling complete callback: update invoice status and remove from sending index
  const handlePollingComplete = (invoiceHash: AleoField, updatedInvoice: Invoice) => {
    console.log(`✅ [AutoPoller] Polling complete for: ${invoiceHash}`);
    
    // Update invoice to store (updateInvoice will automatically update the sending index)
    updateInvoice(updatedInvoice.id, updatedInvoice, {
      masterKey: undefined, // Auto-poller does not handle encryption; determined by the specific page
      persistFull: false     // Only update in memory, do not persist (to avoid overwriting user data)
    }).catch((error) => {
      console.error(`❌ [AutoPoller] Failed to update invoice ${invoiceHash}:`, error);
    });
    
    // Mark as confirmed (remove from sending index)
    markInvoiceConfirmed(invoiceHash);
    
    // Remove from tracking set
    pollingHashesRef.current.delete(invoiceHash);
  };

  // Use the polling hook
  const { startPolling } = useInvoiceListPolling(handlePollingComplete);

  // Listen for changes to sendingInvoiceHashes and automatically start polling
  useEffect(() => {
    const currentSendingHashes = Object.keys(sendingInvoiceHashes) as AleoField[];
    
    // Find newly added SENDING invoices (those that have not started polling yet)
    const newHashes = currentSendingHashes.filter(
      hash => !pollingHashesRef.current.has(hash)
    );
    
    if (newHashes.length > 0) {
      console.log(`🔄 [AutoPoller] Detected ${newHashes.length} new SENDING invoice(s), starting polling...`);
      
      // Mark as polling started
      newHashes.forEach(hash => pollingHashesRef.current.add(hash));
      
      // Start polling
      startPolling(newHashes);
    }
    
    // Cleanup: remove hashes that are no longer in the sending list
    const currentHashSet = new Set(currentSendingHashes);
    for (const hash of pollingHashesRef.current) {
      if (!currentHashSet.has(hash)) {
        pollingHashesRef.current.delete(hash);
      }
    }
  }, [sendingInvoiceHashes, startPolling]);

  // This is a background component with no UI
  return null;
}
