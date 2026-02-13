'use client';

import { useMemo, useState } from 'react';
import { useAuditController } from '@/controller/Audit/useAuditController';
import type { AleoAddress, AleoField } from '@/lib/types';
import { AuditPackage } from '@/lib/audit';

export default function AuditKeyGenerator() {
  const { generate, downloadPackage, loading } = useAuditController();
  
  // UI state: form values
  const [invoiceId, setInvoiceId] = useState('');
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [auditor, setAuditor] = useState('');
  const [permissions, setPermissions] = useState<string[]>([
    'READ_AMOUNT',
    'READ_PARTIES',
    'READ_DETAILS'
  ]);
  
  // UI state: result
  const [result, setResult] = useState<{ auditKey: string; pkg: AuditPackage } | null>(null);

  const permissionsList = useMemo(
    () => [
      { key: 'READ_AMOUNT', label: 'Amount' },
      { key: 'READ_PARTIES', label: 'Parties' },
      { key: 'READ_DETAILS', label: 'Full details' },
      { key: 'READ_LINE_ITEMS', label: 'Line items (if details limited)' }
    ],
    []
  );

  const togglePermission = (key: string) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const handleDownload = () => {
    if (!result) return;
    downloadPackage(result.pkg, result.pkg.invoiceId);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    try {
      const { pkg, auditKey } = await generate({
        invoiceId: invoiceId.trim() as AleoField,
        auditorAddress: auditor.trim() as AleoAddress,
        expiresAt: new Date(expiresAt).getTime(),
        permissions
      });
      setResult({ auditKey, pkg });
    } catch (err: any) {
      // Error is already handled by unified error handler
      // Just prevent further execution
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <form onSubmit={handleGenerate} className="space-y-3">
        <div className="text-sm font-semibold text-slate-900">Generate Audit Package</div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Invoice ID</label>
          <input
            type="text"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            placeholder="invoiceId field"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Auditor address</label>
          <input
            type="text"
            value={auditor}
            onChange={(e) => setAuditor(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            placeholder="aleo1..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Expiration date</label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-800">Permissions</div>
          <div className="grid grid-cols-2 gap-2">
            {permissionsList.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={permissions.includes(p.key)}
                  onChange={() => togglePermission(p.key)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </form>

      {result && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
          <div className="font-semibold text-slate-900">Audit Key (share securely)</div>
          <div className="break-all rounded border border-slate-200 bg-white p-2 text-xs">
            {result.auditKey}
          </div>
          <div className="font-semibold text-slate-900">Audit Package JSON</div>
          <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-white p-2 text-xs">
            {JSON.stringify(result.pkg, null, 2)}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Download JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
