import { useCallback, useMemo, useState } from 'react';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';
import type { AuditPackageEnvelope } from '@/types/audit-package';
import type { VerifyEnvelopePhasesResult } from '@/services/AuditService/IAuditService';

/**
 * Audit Verify Controller
 *
 * Responsibilities:
 * - Manage state for audit package verification (envelope, audit key, result, loading, error)
 * - Orchestrate four-phase verification via AuditService
 * - Provide handlers for file upload, verify, and export report
 */
export function useAuditVerifyController() {
  const [envelopeText, setEnvelopeText] = useState('');
  const [auditKey, setAuditKey] = useState('');
  const [result, setResult] = useState<VerifyEnvelopePhasesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auditService = useMemo(
    () =>
      new AuditService({
        signerAddress: null,
        signMessage: async () => {
          throw new Error('Not needed for verification');
        }
      }),
    []
  );
  const protocolService = useMemo(() => new AleoProtocolService(), []);
  const registry = useMemo(() => createInvoiceRegistryService(protocolService), [protocolService]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        JSON.parse(text);
        setEnvelopeText(text);
        setError(null);
      } catch {
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleVerify = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setResult(null);
      setLoading(true);
      try {
        const envelope = JSON.parse(envelopeText) as AuditPackageEnvelope;
        const key = auditKey.trim().replace(/\s/g, '');
        if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
          setError('Audit Key must be 64 hex characters');
          return;
        }
        const res = await auditService.verifyEnvelopePhases(envelope, key, registry);
        setResult(res);
      } catch (err: any) {
        setError(err?.message ?? 'Verification failed');
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [envelopeText, auditKey, auditService, registry]
  );

  const handleExportReport = useCallback(() => {
    if (!result) return;
    const report = {
      verifiedAt: new Date().toISOString(),
      overallValid: result.overallValid,
      phases: {
        phase1: result.phase1,
        phase2: result.phase2,
        phase3: result.phase3,
        phase4: result.phase4
      },
      decryptedData: result.decrypted
        ? { invoiceId: result.decrypted.invoiceId, data: result.decrypted.data }
        : undefined
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-verification-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return {
    envelopeText,
    setEnvelopeText,
    auditKey,
    setAuditKey,
    result,
    loading,
    error,
    handleFileUpload,
    handleVerify,
    handleExportReport
  };
}
