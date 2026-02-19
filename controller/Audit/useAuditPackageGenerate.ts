import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import type { AleoAddress, AleoField, Invoice } from '@/lib/types';
import type { AuditPackageEnvelope } from '@/types/audit-package';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { DEFAULT_FIELDS, AUDIT_FIELDS_LIST, getDefaultAuditExpiresAt } from './auditConstants';
import { fieldsToPermissions } from './auditHelpers';

/**
 * Audit Package Generate Controller
 *
 * Single responsibility: generate audit package (envelope + auditKey encrypted with user's audit key).
 * Used by Audit Center (/audit) and invoice detail page for "Download audit package".
 */
export function useAuditPackageGenerate() {
  const wallet = useWallet();
  const { publicKey, masterKey } = useUserStore();
  const { getAllInvoices } = useInvoiceStore.getState();
  const { handleError } = useErrorHandler();
  const [loading, setLoading] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [invoices, setInvoices] = useState<{ id: AleoField; invoiceHash: AleoField }[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [expiresAt, setExpiresAt] = useState(() => getDefaultAuditExpiresAt());
  const [fields, setFields] = useState<string[]>(() => [...DEFAULT_FIELDS]);
  const [result, setResult] = useState<{ envelope: AuditPackageEnvelope; auditKey: string } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const walletService = useMemo(
    () => (wallet ? new WalletService(createWalletAdapter(wallet)) : null),
    [wallet]
  );

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!walletService || !publicKey) {
        throw new Error('Wallet not connected. Please connect first.');
      }
      return walletService.signMessage(message, String(publicKey));
    },
    [walletService, publicKey]
  );

  const auditService = useMemo(
    () =>
      new AuditService({
        signerAddress: (publicKey ? String(publicKey) : null) as AleoAddress | null,
        signMessage
      }),
    [publicKey, signMessage]
  );

  const copyAuditKey = useCallback(() => {
    if (!result?.auditKey) return;
    navigator.clipboard.writeText(result.auditKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }, [result?.auditKey]);

  const downloadPackage = useCallback(
    (envelope: AuditPackageEnvelope, id: string) => {
      try {
        const blob = new Blob([JSON.stringify(envelope, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-package-${id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: any) {
        handleError(err);
      }
    },
    [handleError]
  );

  const loadInvoiceOptions = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const list = await getAllInvoices({ refreshMemory: true });
      setInvoices(list.map((inv) => ({ id: inv.id, invoiceHash: inv.invoiceHash })));
    } finally {
      setLoadingInvoices(false);
    }
  }, [getAllInvoices]);

  const toggleField = useCallback((key: string) => {
    setFields((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }, []);

  const downloadResult = useCallback(() => {
    if (!result) return;
    downloadPackage(result.envelope, result.envelope.context.invoice_id);
  }, [result, downloadPackage]);

  const generate = useCallback(
    async (opts: {
      invoiceId: AleoField;
      selectedFields?: string[];
      expiresAt: number;
    }): Promise<{ envelope: AuditPackageEnvelope; auditKey: string }> => {
      setLoading(true);
      try {
        // masterKey optional: chain-synced invoices (no details) can generate chain-anchored package without decryption
        const list = await getAllInvoices({ masterKey: masterKey ?? undefined, refreshMemory: false });
        const invoice =
          list.find((i) => i.id === opts.invoiceId) ||
          list.find((i) => i.invoiceHash === opts.invoiceId);

        if (!invoice) {
          throw new Error('Invoice not found locally. Please sync invoices first.');
        }

        // Allow chain-synced invoices (no nonce/auditKey/details): AuditService.generate will use chain-anchored path when commitment_root is on chain.
        const invoiceWithAuditKey = invoice as Invoice & { auditKey?: string };
        const hasAuditKey = invoiceWithAuditKey.auditKey && /^[0-9a-fA-F]{64}$/.test(invoiceWithAuditKey.auditKey);

        const selectedFields =
          opts.selectedFields && opts.selectedFields.length > 0 ? opts.selectedFields : DEFAULT_FIELDS;
        const permissions = fieldsToPermissions(selectedFields);

        const genResult = await auditService.generate({
          invoice,
          expiresAt: opts.expiresAt,
          permissions,
          auditKey: hasAuditKey ? invoiceWithAuditKey.auditKey : undefined
        });

        console.log('[Audit] generate() success, setting result', {
          hasEnvelope: !!genResult?.envelope,
          hasAuditKey: !!genResult?.auditKey
        });
        setResult({ envelope: genResult.envelope, auditKey: genResult.auditKey });
        return { envelope: genResult.envelope, auditKey: genResult.auditKey };
      } catch (err: any) {
        console.log('[Audit] generate() caught error', err?.message ?? err);
        handleError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [auditService, getAllInvoices, handleError, masterKey]
  );

  const generateFromForm = useCallback(async () => {
    setResult(null);
    try {
      const pkg = await generate({
        invoiceId: invoiceId.trim() as AleoField,
        expiresAt: new Date(expiresAt).getTime(),
        selectedFields: fields
      });
      console.log('[Audit] generateFromForm received pkg', !!pkg?.envelope, !!pkg?.auditKey);
      setResult(pkg);
    } catch {
      // Error is already handled by unified error handler
    }
  }, [generate, invoiceId, expiresAt, fields]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      generateFromForm();
    },
    [generateFromForm]
  );

  return {
    generate,
    downloadPackage,
    loadInvoiceOptions,
    loading,
    loadingInvoices,
    publicKey,
    fieldsList: AUDIT_FIELDS_LIST,
    invoices,
    invoiceId,
    expiresAt,
    fields,
    result,
    keyCopied,
    setInvoiceId,
    setExpiresAt,
    toggleField,
    downloadResult,
    copyAuditKey,
    handleSubmit
  };
}
