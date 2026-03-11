import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { toast } from 'sonner';
import { useUserStore } from '@/stores/User/useUserStore';
import { useReceiptStore, type ReceiptItem } from '@/stores/Receipt/useReceiptStore';
import { useInvoiceChainScan } from '@/controller/Invoice/useInvoiceChainScan';
import { cleanAleoNumber } from '@/lib/utils';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import type { EncryptedPayload } from '@/lib/types';

function normalizeField(field?: string): string {
  return String(field ?? '').replace(/field\.(private|public)$/i, 'field').trim();
}

function toReceiptItem(record: any): ReceiptItem | null {
  const paymentId = normalizeField(record?.payment_id);
  const invoiceId = normalizeField(record?.invoice_id);
  const payer = String(record?.payer ?? '').trim();
  const payee = String(record?.payee ?? '').trim();
  if (!paymentId || !invoiceId || !payer || !payee) return null;

  const paidAtUnix = Number(cleanAleoNumber(record?.paid_at ?? 0));
  const paidAt = Number.isFinite(paidAtUnix) && paidAtUnix > 0
    ? new Date(paidAtUnix * 1000)
    : new Date();

  return {
    paymentId: paymentId as any,
    invoiceId: invoiceId as any,
    payer: payer as any,
    payee: payee as any,
    amount: BigInt(cleanAleoNumber(record?.amount ?? 0)) as any,
    paidAt,
    settlementAnchor: record?.settlement_anchor
      ? (normalizeField(record.settlement_anchor) as any)
      : undefined,
    txId: record?.transactionId ? String(record.transactionId).trim() as any : undefined,
    blockHeight: Number.isFinite(Number(record?.blockHeight)) ? Number(record.blockHeight) : undefined
  };
}

export function useReceipts() {
  const wallet = useWallet();
  const { publicKey } = useUserStore();
  const { scanAllPaymentRecords } = useInvoiceChainScan();
  const { receipts, setReceipts, getAllReceipts, exportCsv, bulkEnrichDetails } = useReceiptStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  /** Prevent infinite loop: auto-sync only once when receipts are empty (do not re-run when sync returns 0) */
  const hasAutoSyncAttemptedRef = useRef(false);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    try {
      await getAllReceipts();
    } finally {
      setIsLoading(false);
    }
  }, [getAllReceipts]);

  const handleSyncAllReceipts = useCallback(async () => {
    if (!publicKey || !wallet?.connected) {
      toast.error('Connect wallet first');
      return;
    }

    setIsSyncing(true);
    toast.loading('Syncing payment records...', { id: 'sync-receipts' });
    try {
      const paymentMap = await scanAllPaymentRecords();
      const items: ReceiptItem[] = [];
      for (const payment of paymentMap.values()) {
        const item = toReceiptItem(payment);
        if (item) items.push(item);
      }
      await setReceipts(items);

      // Enrich receipts with invoice details from KV (§3.9: decrypt EncryptedPayload with invoiceId)
      if (items.length > 0) {
        try {
          const cryptoService = new CryptoService();
          const enriched = await Promise.all(
            items.map(async (item) => {
              try {
                const res = await fetch(
                  `/api/invoice-details?invoiceId=${encodeURIComponent(String(item.invoiceId))}`
                );
                if (!res.ok) return item;
                const { details } = await res.json();
                if (!details) return item;
                const raw = details as Record<string, unknown>;
                if (typeof raw?.iv === 'string' && typeof raw?.ciphertext === 'string') {
                  const decrypted = await cryptoService.decryptPayloadWithInvoiceId(
                    raw as unknown as EncryptedPayload,
                    String(item.invoiceId)
                  );
                  return { ...item, details: decrypted };
                }
                return { ...item, details };
              } catch {
                return item;
              }
            })
          );
          bulkEnrichDetails(enriched);
        } catch {
          // Non-fatal — receipts are synced even without details
        }
      }

      toast.success('Receipts synced', {
        id: 'sync-receipts',
        description: `Synced ${items.length} payment receipt(s) from chain`
      });
    } catch (error) {
      console.error('❌ [useReceipts] Sync failed:', error);
      toast.error('Sync failed', {
        id: 'sync-receipts',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSyncing(false);
    }
  }, [publicKey, wallet?.connected, scanAllPaymentRecords, setReceipts]);

  useEffect(() => {
    if (publicKey && wallet?.connected) {
      void initialize();
    }
  }, [publicKey, wallet?.connected, initialize]);

  useEffect(() => {
    if (!publicKey || !wallet?.connected || isSyncing || hasAutoSyncAttemptedRef.current) return;
    if (receipts.length > 0) return;
    hasAutoSyncAttemptedRef.current = true;
    void handleSyncAllReceipts();
  }, [publicKey, wallet?.connected, receipts.length, isSyncing, handleSyncAllReceipts]);

  const sortedReceipts = useMemo(
    () => [...receipts].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()),
    [receipts]
  );

  return {
    receipts: sortedReceipts,
    isLoading,
    isSyncing,
    showWalletPrompt: !isLoading && !publicKey,
    handleSyncAllReceipts,
    exportCsv
  };
}
