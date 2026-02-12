import { useEffect, useState } from 'react';
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
  
  const [isLoading, setIsLoading] = useState(true);

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

  // Derive confirmationStatus reactively from currentInvoice.metadata
  const confirmationStatus: ChainConfirmationStatus | null = currentInvoice?.metadata?.confirmationStatus || null;

  return { 
    invoice: currentInvoice, 
    isLoading, 
    // Return the actual confirmationStatus; upstream can combine with sendingInvoiceHashes
    confirmationStatus: currentInvoice ? confirmationStatus : null
  };
}
