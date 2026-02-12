'use client';

import { useState } from 'react';
import { useAuditController } from '@/controller/Audit/useAuditController';
import { AuditPackage } from '@/lib/audit';

export default function AuditValidator() {
  const { validate } = useAuditController();
  const [pkgText, setPkgText] = useState('');
  const [auditKey, setAuditKey] = useState('');
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    details?: any;
    chain?: {
      exists: boolean;
      hashMatch: boolean;
      status: string | null;
    };
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExport = () => {
    if (!result || !result.ok) return;
    const snapshot = {
      verifiedAt: new Date().toISOString(),
      decrypted: result.details,
      chain: result.chain
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setLoading(true);
    try {
      const pkg = JSON.parse(pkgText) as AuditPackage;
      const outcome = await validate(pkg, auditKey.trim());
      if (outcome.valid) {
        setResult({
          ok: true,
          message: 'Audit package is valid',
          details: outcome.decrypted,
          chain: outcome.chainVerification
            ? {
                exists: outcome.chainVerification.invoiceExistsOnChain,
                hashMatch: outcome.chainVerification.hashMatchesChain,
                status: outcome.chainVerification.chainStatus !== null
                  ? outcome.chainVerification.chainStatus.toString()
                  : null
              }
            : undefined
        });
      } else {
        setResult({
          ok: false,
          message: outcome.reason || 'Invalid package'
        });
      }
    } catch (err: any) {
      setResult({
        ok: false,
        message: err?.message || 'Failed to validate package'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <form onSubmit={handleValidate} className="space-y-3">
        <div className="text-sm font-semibold text-slate-900">Validate Audit Package</div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Audit package JSON</label>
          <textarea
            value={pkgText}
            onChange={(e) => setPkgText(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:border-slate-400 focus:outline-none"
            placeholder="{...}"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Audit key</label>
          <input
            type="text"
            value={auditKey}
            onChange={(e) => setAuditKey(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            placeholder="hex audit key"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {loading ? 'Validating...' : 'Validate'}
        </button>
      </form>

      {result && (
        <div
          className={`rounded-lg p-3 text-sm ${
            result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          <div className="font-semibold">
            {result.ok ? 'Valid package' : 'Invalid package'}
          </div>
          <div className="mt-1">{result.message}</div>
          {result.ok && result.details && (
            <pre className="mt-2 max-h-56 overflow-auto rounded border border-slate-200 bg-white p-2 text-xs text-slate-900">
              {JSON.stringify(result.details, null, 2)}
            </pre>
          )}
          {result.chain && (
            <div className="mt-2 space-y-1 rounded border border-slate-200 bg-white p-2 text-xs text-slate-900">
              <div>Chain verification:</div>
              <div>- Exists: {result.chain.exists ? 'yes' : 'no'}</div>
              <div>- Hash match: {result.chain.hashMatch ? 'yes' : 'no'}</div>
              <div>- Status: {result.chain.status ?? 'unknown'}</div>
            </div>
          )}
          {result.ok && (
            <button
              onClick={handleExport}
              className="mt-2 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Export snapshot
            </button>
          )}
        </div>
      )}
    </div>
  );
}
