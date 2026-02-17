import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import type { AleoAddress, AleoField, Invoice } from '@/lib/types';
import type { AuditPackage, AuditPackageEnvelope } from '@/types/audit-package';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { DEFAULT_FIELDS, AUDIT_FIELDS_LIST, getDefaultAuditExpiresAt } from './auditConstants';
import { buildScopesBitmask, fieldsToPermissions } from './auditHelpers';

/**
 * Audit Controller Hook
 * 
 * Responsibilities:
 * - Bridge React context (wallet, stores) to service layer
 * - Manage loading state for UI
 * - Use unified error handler for consistent error reporting
 * - Provide high-level controller methods for components
 * 
 * Pattern:
 * - Similar to wallet service pattern
 * - Uses factory function to create service with injected dependencies
 * - Uses unified error handler for consistent error reporting
 * - Reuses wallet service's signMessage (no duplication of encoding/decoding)
 */
export function useAuditController() {
  const wallet = useWallet();
  const { publicKey, masterKey } = useUserStore();
  const { getAllInvoices } = useInvoiceStore.getState();
  const { handleError } = useErrorHandler();
  const [loading, setLoading] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Form & result state (owned by controller so the UI layer stays presentational)
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

  const protocolService = useMemo(() => new AleoProtocolService(), []);
  const registry = useMemo(() => createInvoiceRegistryService(protocolService), [protocolService]);

  const auditService = useMemo(
    () =>
      new AuditService({
        signerAddress: (publicKey ? String(publicKey) : null) as AleoAddress | null,
        signMessage
      }),
    [publicKey, signMessage]
  );

  const { executeSetAuditAuthorization } = useTransactionController();

  const copyAuditKey = useCallback(() => {
    if (!result?.auditKey) return;
    navigator.clipboard.writeText(result.auditKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }, [result?.auditKey]);

  /**
   * Download envelope as JSON file.
   */
  const downloadPackage = useCallback(
    (envelope: AuditPackageEnvelope, invoiceId: string) => {
      try {
        const blob = new Blob([JSON.stringify(envelope, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-package-${invoiceId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: any) {
        handleError(err);
      }
    },
    [handleError]
  );

  /**
   * Load invoice options for the audit UI (id + invoiceHash).
   * Refreshes from store and updates controller's invoices state.
   */
  const loadInvoiceOptions = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const list = await getAllInvoices({ refreshMemory: true });
      console.log('list', list);
      setInvoices(
        list.map((inv) => ({ id: inv.id, invoiceHash: inv.invoiceHash }))
      );
    } finally {
      setLoadingInvoices(false);
    }
  }, [getAllInvoices]);

  const toggleField = useCallback((key: string) => {
    setFields((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }, []);

  /**
   * Download the current envelope (if any). Audit key is shown separately; do not bundle in JSON.
   */
  const downloadResult = useCallback(() => {
    if (!result) return;
    downloadPackage(result.envelope, result.envelope.context.invoice_id);
  }, [result, downloadPackage]);

  /**
   * Generate an audit package: resolve invoice from local DB (with nonce), then call service.
   */
  const generate = useCallback(
    async (opts: {
      invoiceId: AleoField;
      selectedFields?: string[];
      expiresAt: number;
    }): Promise<{ envelope: AuditPackageEnvelope; auditKey: string }> => {
      setLoading(true);
      try {
        if (!masterKey) {
          throw new Error('Master key missing. Please sign in to load invoice details.');
        }

        const invoices = await getAllInvoices({ masterKey, refreshMemory: false });
        const invoice =
          invoices.find((i) => i.id === opts.invoiceId) ||
          invoices.find((i) => i.invoiceHash === opts.invoiceId);

        if (!invoice) {
          throw new Error('Invoice not found locally. Please sync invoices first.');
        }

        if (!invoice.details) {
          throw new Error('Invoice details are not decrypted. Cannot build audit package.');
        }

        const invoiceWithNonce = invoice as Invoice & { nonce?: AleoField };
        if (!invoiceWithNonce.nonce) {
          throw new Error('Invoice nonce is missing. Use an invoice created on-chain (with nonce).');
        }

        const fields =
          opts.selectedFields && opts.selectedFields.length > 0 ? opts.selectedFields : DEFAULT_FIELDS;
        const permissions = fieldsToPermissions(fields);

        const [commitmentRoot, fieldCommitments] = await Promise.all([
          registry.getCommitmentRoot(invoice.id),
          registry.getFieldCommitments(invoice.id)
        ]);

        const genResult = await auditService.generate({
          invoice,
          expiresAt: opts.expiresAt,
          permissions,
          chainCommitmentRoot: commitmentRoot ?? undefined,
          chainFieldCommitments: fieldCommitments ?? undefined
        });

        const scopesBitmask = buildScopesBitmask(
          opts.selectedFields && opts.selectedFields.length > 0 ? opts.selectedFields : DEFAULT_FIELDS
        );
        const expiresAtSeconds =
          opts.expiresAt >= 1e12 ? Math.floor(opts.expiresAt / 1000) : opts.expiresAt;

        await executeSetAuditAuthorization(
          invoice,
          String(genResult.auditKeyHash),
          scopesBitmask,
          expiresAtSeconds
        );

        setResult({ envelope: genResult.envelope, auditKey: genResult.auditKey });
        return { envelope: genResult.envelope, auditKey: genResult.auditKey };
      } catch (err: any) {
        handleError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [auditService, executeSetAuditAuthorization, getAllInvoices, handleError, masterKey, registry]
  );

  /**
   * Generate audit package from current form state (invoiceId, expiresAt, fields).
   */
  const generateFromForm = useCallback(async () => {
    setResult(null);
    try {
      const pkg = await generate({
        invoiceId: invoiceId.trim() as AleoField,
        expiresAt: new Date(expiresAt).getTime(),
        selectedFields: fields
      });
      setResult(pkg);
    } catch {
      // Error is already handled by unified error handler
    }
  }, [generate, invoiceId, expiresAt, fields]);

  /**
   * Form submit handler: preventDefault + generateFromForm (for use as form onSubmit).
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      generateFromForm();
    },
    [generateFromForm]
  );

  /**
   * Verify an audit package by recomputing rules hash and calling on-chain asserts.
   */
  const verify = useCallback(
    async (
      pkg: AuditPackage
    ): Promise<{
      valid: boolean;
      reason?: string;
      anchors?: Record<string, unknown>;
      assertions?: Record<string, { ok: boolean; error?: string }>;
    }> => {
      setLoading(true);
      try {
        const anchors: Record<string, unknown> = {};
      const assertions: Record<string, { ok: boolean; error?: string }> = {
        rules: { ok: false },
        commitment: { ok: false },
        amount: { ok: pkg.payload?.amount !== undefined ? false : true },
        ownership: { ok: pkg.payload?.buyer !== undefined ? false : true },
        counter: { ok: true }
      };

      // Fetch anchors for display (best-effort)
      try {
        anchors.commitment = await registry.getCommitmentRoot(pkg.invoice_id);
        anchors.fieldCommitments = await registry.getFieldCommitments(pkg.invoice_id);
        anchors.rulesResult = await registry.getRulesResult(pkg.invoice_id);
        anchors.auditAuthorization = await registry.getAuditAuthorization(pkg.invoice_id);
      } catch (e) {
        // display only
      }

      // Core verification (hash parity & generic checks)
      const core = await auditService.verifyAuditPackage(pkg, {
        assertRules: protocolService.assertRules.bind(protocolService),
        assertAmount: protocolService.assertAmount.bind(protocolService),
        assertOwnership: protocolService.assertOwnership.bind(protocolService) as any,
        assertCommitment: protocolService.assertCommitment.bind(protocolService),
        assertCounter: protocolService.assertCounter.bind(protocolService) as any
      });

      // Individual assert calls for UI feedback (best-effort)
      try {
        await protocolService.assertRules(pkg.invoice_id, pkg.rules_hash);
        assertions.rules.ok = true;
      } catch (e: any) {
        assertions.rules = { ok: false, error: e?.message };
      }

      try {
        await protocolService.assertCommitment(pkg.invoice_id, pkg.commitments_root);
        assertions.commitment.ok = true;
      } catch (e: any) {
        assertions.commitment = { ok: false, error: e?.message };
      }

      const record = (pkg as any).invoice_record;
      if (record && pkg.payload) {
        try {
          await protocolService.assertAmount(
            record,
            pkg.invoice_hash,
            BigInt(String(pkg.payload?.min_amount ?? 0)),
            BigInt(String(pkg.payload?.max_amount ?? pkg.payload?.amount ?? 0))
          );
          assertions.amount.ok = true;
        } catch (e: any) {
          assertions.amount = { ok: false, error: e?.message };
        }

        try {
          await protocolService.assertOwnership(
            record,
            pkg.invoice_hash,
            (pkg as any).seller ?? record.seller,
            (pkg as any).buyer ?? record.buyer
          );
          assertions.ownership.ok = true;
        } catch (e: any) {
          assertions.ownership = { ok: false, error: e?.message };
        }
      }

        const valid =
          core.valid &&
          Object.values(assertions).every((a) => a.ok !== false);
        const reason = valid ? undefined : core.reason || 'assert_failed';
        return { valid, reason, anchors, assertions };
      } catch (err: any) {
        handleError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [auditService, handleError, protocolService]
  );

  return {
    generate,
    verify,
    downloadPackage,
    loadInvoiceOptions,
    loading,
    loadingInvoices,
    publicKey,
    fieldsList: AUDIT_FIELDS_LIST,
    // Form state (controller-owned)
    invoices,
    invoiceId,
    expiresAt,
    fields,
    result,
    keyCopied,
    // Form actions
    setInvoiceId,
    setExpiresAt,
    toggleField,
    downloadResult,
    copyAuditKey,
    handleSubmit
  };
}
