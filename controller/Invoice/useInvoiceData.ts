import { useEffect, useRef, useState } from 'react';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import type { InvoiceState } from '@/stores/Invoice/InvoiceState';
import { AleoField, EncryptedPayload } from '@/lib/types';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';

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

  // When the current invoice has no details (buyer side), fetch from KV and decrypt (§3.9).
  // The ref tracks hashes we already fetched. If the invoice had details but now doesn't
  // (e.g. after a chain sync overwrite), we clear the guard so it can re-fetch.
  const prevDetailsRef = useRef<boolean>(false);
  useEffect(() => {
    const hasDetails = !!currentInvoice?.details;
    if (prevDetailsRef.current && !hasDetails && currentInvoice?.invoiceHash) {
      fetchedHashesRef.current.delete(currentInvoice.invoiceHash);
    }
    prevDetailsRef.current = hasDetails;
  }, [currentInvoice?.details, currentInvoice?.invoiceHash]);

  useEffect(() => {
    if (!currentInvoice || currentInvoice.details) return;
    const hash = currentInvoice.invoiceHash;
    const invoiceId = currentInvoice.id;
    if (!hash || !invoiceId || fetchedHashesRef.current.has(hash)) return;
    fetchedHashesRef.current.add(hash);

    fetch(`/api/invoice-details?invoiceHash=${encodeURIComponent(hash)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (!data?.details) return;
        const raw = data.details as Record<string, unknown>;
        // §3.9: payload may be EncryptedPayload (iv + ciphertext) or legacy plaintext
        let plainDetails: unknown = raw;
        if (
          typeof raw?.iv === 'string' &&
          typeof raw?.ciphertext === 'string'
        ) {
          try {
            plainDetails = await new CryptoService().decryptPayloadWithInvoiceId(
              raw as unknown as EncryptedPayload,
              invoiceId
            );
          } catch (e) {
            console.warn('[useInvoiceData] KV decrypt failed:', e);
            return;
          }
        }
        void updateInvoice(
          currentInvoice.id,
          { details: plainDetails } as any,
          { masterKey: masterKey || undefined, persistFull: !!masterKey }
        );
      })
      .catch((err) => console.warn('[useInvoiceData] KV fetch failed:', err));
  }, [currentInvoice?.invoiceHash, currentInvoice?.id, currentInvoice?.details, masterKey, updateInvoice]);

  // Derive confirmationStatus reactively from currentInvoice.metadata
  const confirmationStatus: ChainConfirmationStatus | null = currentInvoice?.metadata?.confirmationStatus || null;

  return { 
    invoice: currentInvoice, 
    isLoading, 
    // Return the actual confirmationStatus; upstream can combine with sendingInvoiceHashes
    confirmationStatus: currentInvoice ? confirmationStatus : null
  };
}
