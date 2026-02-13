import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { PROGRAM_ID } from '@/lib/contract';
import type { AleoAddress, AleoField } from '@/lib/types';
import type { AuditPackage } from '@/types/audit-package';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';
import { DEFAULT_FIELDS, AUDIT_FIELDS_LIST, getDefaultAuditExpiresAt } from './auditConstants';
import { toSeconds, sumLineItems, buildScopesBitmask } from './auditHelpers';

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
  const [result, setResult] = useState<AuditPackage | null>(null);

  const cryptoService = useMemo(() => new CryptoService(), []);
  const protocolService = useMemo(() => new AleoProtocolService(), []);

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!wallet.signMessage) return '';
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const sigBytes = await wallet.signMessage(encoder.encode(message));
      return decoder.decode(sigBytes);
    },
    [wallet]
  );

  const auditService = useMemo(
    () =>
      new AuditService({
        signerAddress: (publicKey ? String(publicKey) : null) as AleoAddress | null,
        getAllInvoices,
        signMessage
      }),
    [getAllInvoices, publicKey, signMessage]
  );

  /**
   * Download audit package as JSON file.
   */
  const downloadPackage = useCallback(
    (pkg: AuditPackage, invoiceId: string) => {
      try {
        const blob = new Blob([JSON.stringify(pkg, null, 2)], {
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
   * Download the current audit package result (if any).
   */
  const downloadResult = useCallback(() => {
    if (!result) return;
    downloadPackage(result, result.invoice_id);
  }, [result, downloadPackage]);

  /**
   * Generate an audit package referencing on-chain anchors plus minimal disclosed fields.
   */
  const generate = useCallback(
    async (opts: {
      invoiceId: AleoField;
      selectedFields?: string[];
      scopesBitmask?: bigint;
      expiresAt: number;
      auditor?: AleoAddress;
    }): Promise<AuditPackage> => {
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

      const details = invoice.details;
      if (!details) {
        throw new Error('Invoice details are not decrypted. Cannot build audit package.');
      }

      const fields = opts.selectedFields && opts.selectedFields.length > 0
        ? opts.selectedFields
        : DEFAULT_FIELDS;
      const scopes = opts.scopesBitmask ?? buildScopesBitmask(fields);

      // Fetch on-chain anchors
      const [commitmentRoot, fieldCommitments, rulesResult, auth] = await Promise.all([
        protocolService.getInvoiceCommitment(invoice.id),
        protocolService.getInvoiceFieldCommitments(invoice.id),
        protocolService.getRulesResult(invoice.id),
        protocolService.getAuditAuthorization(invoice.id)
      ]);

      if (!commitmentRoot || !fieldCommitments) {
        throw new Error('Commitment caches are missing on chain for this invoice.');
      }

      // Compute rules hash locally if cache is absent
      let rulesHash = rulesResult || null;
      if (!rulesHash) {
        const rules = await cryptoService.evaluateAuditRules({
          amount: invoice.amount,
          taxAmount: BigInt(Math.round(details.taxAmount)),
          dueDate: toSeconds(invoice.dueDate),
          currentTime: Math.floor(Date.now() / 1000),
          lineItemsSum: BigInt(Math.round(sumLineItems(details.lineItems))),
          expectedTotal: BigInt(Math.round(details.total)),
          taxRateBps: BigInt(Math.round(details.taxRate * 10000)),
          invoiceHash: invoice.invoiceHash
        });
        rulesHash = rules.rulesHash;
      }

      // Minimal payload with selected fields
      const payload: Record<string, unknown> = {};
      const itemsHash =
        fields.includes('items_hash') && details.lineItems
          ? await cryptoService.computeInvoiceHash({ ...details, notes: undefined })
          : undefined;
      const setIfSelected = (key: string, value: unknown) => {
        if (fields.includes(key) && value !== undefined) {
          payload[key] = value;
        }
      };

      setIfSelected('amount', invoice.amount.toString());
      setIfSelected('tax_amount', details.taxAmount);
      setIfSelected('due_date', toSeconds(invoice.dueDate));
      setIfSelected('buyer', invoice.buyer);
      setIfSelected('seller', invoice.seller);
      setIfSelected('currency', details.currency);
      setIfSelected('items_hash', itemsHash);
      setIfSelected('memo_hash', details.notes);
      setIfSelected('order_id', details.invoiceNumber);

      const signatureMessage = [
        'AUDIT_PACKAGE_V2_2',
        PROGRAM_ID,
        invoice.id,
        invoice.invoiceHash,
        rulesHash,
        commitmentRoot,
        scopes.toString()
      ].join('|');

      const pkg = await auditService.generateAuditPackage({
        invoiceId: invoice.id,
        invoiceHash: invoice.invoiceHash,
        rulesHash,
        fieldCommitments: fieldCommitments as any,
        commitmentsRoot: commitmentRoot,
        auditKeyHash: (auth?.audit_key_hash ?? '0field') as AleoField,
        scopesBitmask: scopes,
        expiresAt: opts.expiresAt,
        selectedFields: fields,
        payload,
        signature: await signMessage(signatureMessage),
        programId: PROGRAM_ID,
        version: '2.2'
      });

        return pkg as AuditPackage;
      } catch (err: any) {
        handleError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [auditService, cryptoService, getAllInvoices, handleError, masterKey, protocolService, signMessage]
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
        anchors.commitment = await protocolService.getInvoiceCommitment(pkg.invoice_id);
        anchors.fieldCommitments = await protocolService.getInvoiceFieldCommitments(pkg.invoice_id);
        anchors.rulesResult = await protocolService.getRulesResult(pkg.invoice_id);
        anchors.auditAuthorization = await protocolService.getAuditAuthorization(pkg.invoice_id);
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
    // Form actions
    setInvoiceId,
    setExpiresAt,
    toggleField,
    downloadResult,
    handleSubmit
  };
}
