import { useEffect, useMemo, useState, useCallback } from 'react';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';
import { useAuditPackageGenerate } from '@/controller/Audit/useAuditPackageGenerate';
import { useInvoiceDetail } from './useInvoiceDetail';
import type { AleoField } from '@/lib/types';
import { CurrencyFlag } from '@/lib/types';
import type { IInvoiceDetail } from './IInvoiceDetail';

export interface InvoiceDetailPageAnchors {
  commitment?: string | null;
  rules?: string | null;
  fieldCommitments?: any;
  auth?: any;
  counter?: number | null;
}

export interface UseInvoiceDetailPageReturn extends IInvoiceDetail {
  /** Display currency label (from details.currency or currencyFlag) */
  displayCurrency: string;
  /** Registry anchors (commitment, rules, fieldCommitments, auth, counter) */
  anchors: InvoiceDetailPageAnchors;
  isFetchingAnchors: boolean;
  downloadMsg: string;
  /** JSON stringify with bigint support */
  safeStringify: (obj: any) => string;
  /** Download audit package (minimal or full) */
  handleDownloadPackage: (mode: 'minimal' | 'full') => Promise<void>;
}

/**
 * Controller for the invoice detail page.
 * Composes useInvoiceDetail with registry anchors fetch and audit package download.
 * View layer should only consume this hook and render.
 */
export function useInvoiceDetailPage(invoiceHash: AleoField | null): UseInvoiceDetailPageReturn {
  const detail = useInvoiceDetail(invoiceHash);
  const { generate } = useAuditPackageGenerate();
  const protocolService = useMemo(() => new AleoProtocolService(), []);
  const registry = useMemo(() => createInvoiceRegistryService(protocolService), [protocolService]);

  const [anchors, setAnchors] = useState<InvoiceDetailPageAnchors>({});
  const [isFetchingAnchors, setIsFetchingAnchors] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  const displayCurrency = useMemo(() => {
    const inv = detail.invoice;
    return inv?.details?.currency
      ?? (inv?.currencyFlag === CurrencyFlag.USDCX ? 'USDCX' : 'credits');
  }, [detail.invoice]);

  const safeStringify = useCallback(
    (obj: any) => JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
    []
  );

  useEffect(() => {
    const fetchAnchors = async () => {
      const inv = detail.invoice;
      if (!inv) return;
      setIsFetchingAnchors(true);
      try {
        const [commitment, fieldCommitments, rules, auth, counter] = await Promise.all([
          registry.getCommitmentRoot(inv.id),
          registry.getFieldCommitments(inv.id),
          registry.getRulesResult(inv.id),
          registry.getAuditAuthorization(inv.id),
          registry.getAuditCounter(inv.seller)
        ]);
        setAnchors({ commitment, fieldCommitments, rules, auth, counter });
      } catch {
        setAnchors({});
      } finally {
        setIsFetchingAnchors(false);
      }
    };
    fetchAnchors();
  }, [detail.invoice, registry]);

  const handleDownloadPackage = useCallback(async (mode: 'minimal' | 'full') => {
    const inv = detail.invoice;
    if (!inv) return;
    setDownloadMsg('');
    try {
      const fields =
        mode === 'minimal'
          ? ['amount', 'tax_amount', 'due_date', 'buyer', 'seller']
          : ['amount', 'tax_amount', 'due_date', 'buyer', 'seller', 'currency', 'items_hash', 'memo_hash', 'order_id'];
      const pkg = await generate({
        invoiceId: inv.id,
        selectedFields: fields,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000
      });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-package-${mode}-${inv.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadMsg(`Generated ${mode} package`);
    } catch (e: any) {
      setDownloadMsg(e?.message ?? 'Failed to generate package');
    }
  }, [detail.invoice, generate]);

  return {
    ...detail,
    displayCurrency,
    anchors,
    isFetchingAnchors,
    downloadMsg,
    safeStringify,
    handleDownloadPackage
  };
}
