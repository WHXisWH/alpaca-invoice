'use client';

import { useState } from 'react';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { InvoiceStatus } from '@/lib/types';
import { PROGRAM_ID } from '@/lib/contract';

const protocolService = new AleoProtocolService();

function formatStatus(status: InvoiceStatus | null): string {
  if (status === null || status === undefined) return 'Unknown';
  switch (status) {
    case InvoiceStatus.PENDING:
      return 'PENDING';
    case InvoiceStatus.PAID:
      return 'PAID';
    case InvoiceStatus.CANCELLED:
      return 'CANCELLED';
    case InvoiceStatus.EXPIRED:
      return 'EXPIRED';
    default:
      return 'Unknown';
  }
}

export default function VerifyPage() {
  const [invoiceId, setInvoiceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    exists: boolean;
    hash?: string | null;
    status?: InvoiceStatus | null;
    error?: string;
  } | null>(null);

  const handleCheck = async () => {
    setLoading(true);
    setResult(null);
    try {
      const normalized = invoiceId.trim();
      if (!normalized.endsWith('field')) {
        throw new Error('Invoice ID must be a field (suffix "field").');
      }
      const hash = await protocolService.getInvoiceHash(normalized as any);
      const status = await protocolService.getInvoiceStatus(normalized as any);
      setResult({
        exists: hash !== null,
        hash,
        status
      });
    } catch (error: any) {
      setResult({ exists: false, error: error?.message || 'Lookup failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Verify Invoice (Walletless)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter an invoice_id to check its on-chain anchor in {PROGRAM_ID}. No wallet required.
        </p>

        <div className="mt-4 space-y-3">
          <label className="text-sm font-medium text-slate-800">invoice_id (field)</label>
          <input
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            placeholder="e.g., 12345field"
          />
          <button
            onClick={handleCheck}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? 'Checking...' : 'Check on-chain'}
          </button>
        </div>

        {result && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            {result.error && <div className="text-red-600">Error: {result.error}</div>}
            {!result.error && (
              <>
                <div>Exists: {result.exists ? 'Yes' : 'No'}</div>
                <div>Hash: {result.hash ?? 'N/A'}</div>
                <div>Status: {formatStatus(result.status ?? null)}</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
