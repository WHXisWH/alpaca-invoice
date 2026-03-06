import { useEffect, useRef, useState } from 'react';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import type { InvoiceState } from '@/stores/Invoice/InvoiceState';
import { AleoField } from '@/lib/types';

/**
 * Hook: load invoice data
 *
 * Responsibilities:
 * - Load invoice data from store/IndexedDB
 * - Track confirmationStatus
 * - Manage loading state
 * - Subscribe to currentInvoice so updates are reactive
 */
export function useInvoiceData(invoiceHash: AleoField | null) {
  const { masterKey } = useUserStore();

  // Subscribe directly to currentInvoice from the store
  const currentInvoice = useNewInvoiceStore((state: InvoiceState) => state.currentInvoice);
  const setCurrentInvoice = useNewInvoiceStore((state: InvoiceState) => state.setCurrentInvoice);
  const updateInvoice    = useNewInvoiceStore((state: InvoiceState) => state.updateInvoice);

  const [isLoading, setIsLoading] = useState(true);
  // Track which hashes we have already attempted to fetch so we don't loop
  const fetchedHashesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!invoiceHash) {
      setCurrentInvoice(null);
      setIsLoading(false);
      return;
    }

    const loadInvoice = async () => {
      setIsLoading(true);
      try {
        // Use store helper; it auto-loads from memory or IndexedDB
        await setCurrentInvoice(invoiceHash, {
          masterKey: masterKey || undefined
        });
      } catch (error) {
        console.error('Failed to load invoice:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInvoice();
  }, [invoiceHash, masterKey, setCurrentInvoice]);

  // When the current invoice has no details (buyer side), fetch them from KV.
  useEffect(() => {
    if (!currentInvoice || currentInvoice.details) return;
    const hash = currentInvoice.invoiceHash;
    if (!hash || fetchedHashesRef.current.has(hash)) return;
    fetchedHashesRef.current.add(hash);

    fetch(`/api/invoice-details?invoiceHash=${encodeURIComponent(hash)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.details) return;
        // Persist to buyer's IndexedDB if masterKey is available, otherwise memory-only
        void updateInvoice(
          currentInvoice.id,
          { details: data.details } as any,
          { masterKey: masterKey || undefined, persistFull: !!masterKey }
        );
      })
      .catch((err) => console.warn('[useInvoiceData] KV fetch failed:', err));
  }, [currentInvoice?.invoiceHash, currentInvoice?.details, masterKey, updateInvoice]);

  // Derive confirmationStatus reactively from currentInvoice.metadata
  const confirmationStatus: ChainConfirmationStatus | null = currentInvoice?.metadata?.confirmationStatus || null;

  return { 
    invoice: currentInvoice, 
    isLoading, 
    // Return the actual confirmationStatus; upstream can combine with sendingInvoiceHashes
    confirmationStatus: currentInvoice ? confirmationStatus : null
  };
}
