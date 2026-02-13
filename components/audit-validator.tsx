'use client';

import { useState } from 'react';
import { useAuditController } from '@/controller/Audit/useAuditController';
import type { AuditPackage } from '@/types/audit-package';
import { useAuditLogStore } from '@/stores/AuditLog/useAuditLogStore';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';

const friendlyError = (msg?: string) => {
  if (!msg) return 'Unknown error';
  if (msg.includes('rules')) return 'Rules hash mismatch with on-chain anchor';
  if (msg.includes('commitment')) return 'Commitment root mismatch';
  if (msg.includes('ownership')) return 'Ownership assertion failed';
  if (msg.includes('amount')) return 'Amount range assertion failed';
  if (msg.includes('expired')) return 'Audit authorization expired';
  return msg;
};

export default function AuditValidator() {
  const { verify } = useAuditController();
  const addLog = useAuditLogStore((s) => s.addEntry);
  const exportCsv = useAuditLogStore((s) => s.exportCsv);
  const clearLogs = useAuditLogStore((s) => s.clear);
  const [pkgText, setPkgText] = useState('');
  const [rules, setRules] = useState<
    { key: string; status: 'pass' | 'fail' | 'unknown'; reason?: string }[]
  >([]);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    details?: any;
    anchors?: Record<string, unknown>;
    assertions?: Record<string, { ok: boolean; error?: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const cryptoService = new CryptoService();

  const handleExportSnapshot = () => {
    if (!result || !result.ok) return;
    const snapshot = {
      verifiedAt: new Date().toISOString(),
      payload: result.details,
      rules
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
    setRules([]);
    setLoading(true);
    try {
      const pkg = JSON.parse(pkgText) as AuditPackage;
      const outcome = await verify(pkg);

      const ruleStatuses: { key: string; status: 'pass' | 'fail' | 'unknown'; reason?: string }[] =
        [];
      try {
        const payload = pkg.payload || {};
        if (
          payload.amount !== undefined &&
          payload.tax_amount !== undefined &&
          payload.expected_total !== undefined &&
          payload.amount !== null &&
          payload.tax_amount !== null &&
          payload.expected_total !== null
        ) {
          const evalResult = await cryptoService.evaluateAuditRules({
            amount: BigInt(String(payload.amount)),
            taxAmount: BigInt(String(payload.tax_amount)),
            dueDate: Number(payload.due_date ?? 0),
            currentTime: Number(payload.current_time ?? 0),
            lineItemsSum: BigInt(String(payload.line_items_sum ?? payload.amount)),
            expectedTotal: BigInt(String(payload.expected_total)),
            taxRateBps: BigInt(String(payload.tax_rate_bps ?? 0)),
            invoiceHash: pkg.invoice_hash
          });
          const flags = [evalResult.r1, evalResult.r2, evalResult.r3, evalResult.r4, evalResult.r5];
          ['R1', 'R2', 'R3', 'R4', 'R5'].forEach((k, idx) => {
            ruleStatuses.push({ key: k, status: flags[idx] ? 'pass' : 'fail' });
          });
        } else {
          ['R1', 'R2', 'R3', 'R4', 'R5'].forEach((k) =>
            ruleStatuses.push({ key: k, status: 'unknown', reason: 'Insufficient payload fields' })
          );
        }
      } catch (err) {
        ['R1', 'R2', 'R3', 'R4', 'R5'].forEach((k) =>
          ruleStatuses.push({ key: k, status: 'unknown', reason: 'Evaluation error' })
        );
      }
      setRules(ruleStatuses);

      if (outcome.valid) {
        setResult({
          ok: true,
          message: 'Audit package is valid',
          details: pkg.payload,
          anchors: outcome.anchors,
          assertions: outcome.assertions
        });
        addLog({
          action: 'verify',
          invoiceId: String(pkg.invoice_id),
          auditor: pkg.auditor,
          result: 'ok',
          message: 'verify success',
          timestamp: Date.now()
        });
      } else {
        setResult({
          ok: false,
          message: friendlyError(outcome.reason) || 'Invalid package',
          anchors: outcome.anchors,
          assertions: outcome.assertions
        });
        addLog({
          action: 'verify',
          invoiceId: String(pkg.invoice_id),
          auditor: pkg.auditor,
          result: 'fail',
          message: outcome.reason || 'Invalid package',
          timestamp: Date.now()
        });
      }
    } catch (err: any) {
      setResult({
        ok: false,
        message: err?.message || 'Failed to validate package'
      });
      setRules([]);
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
          {result.details && (
            <pre className="mt-2 max-h-56 overflow-auto rounded border border-slate-200 bg-white p-2 text-xs text-slate-900">
              {JSON.stringify(result.details, null, 2)}
            </pre>
          )}
          {result.anchors && (
            <div className="mt-2 space-y-1 rounded border border-slate-200 bg-white p-2 text-xs text-slate-900">
              <div className="font-semibold text-slate-900">On-chain anchors</div>
              <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2">
                {JSON.stringify(result.anchors, null, 2)}
              </pre>
            </div>
          )}
          {result.assertions && (
            <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs text-slate-900">
              <div className="font-semibold text-slate-900">On-chain asserts</div>
              <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-3">
                {Object.entries(result.assertions).map(([k, v]) => (
                  <div
                    key={k}
                    className={`rounded px-2 py-1 ${
                      v.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {k}: {v.ok ? 'ok' : 'failed'}
                    {v.error && (
                      <div className="mt-1 text-[11px] text-slate-700">
                        {friendlyError(v.error)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {rules.length > 0 && (
            <div className="mt-3 rounded border border-slate-200 bg-white p-2 text-xs text-slate-900">
              <div className="font-semibold text-slate-900">Rule checks (R1–R5)</div>
              <div className="mt-1 grid grid-cols-5 gap-2">
                {rules.map((r) => (
                  <div
                    key={r.key}
                    className={`rounded px-2 py-1 text-center ${
                      r.status === 'pass'
                        ? 'bg-emerald-100 text-emerald-700'
                        : r.status === 'fail'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {r.key}: {r.status}
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.ok && (
            <button
              onClick={handleExportSnapshot}
              className="mt-2 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Export snapshot
            </button>
          )}
        </div>
      )}

      <AuditLogPanel
        onExport={() => {
          const csv = exportCsv();
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'audit-log.csv';
          a.click();
          URL.revokeObjectURL(url);
        }}
        onClear={clearLogs}
      />
    </div>
  );
}

function AuditLogPanel({ onExport, onClear }: { onExport: () => void; onClear: () => void }) {
  const entries = useAuditLogStore((s) => s.entries);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Audit log (local)</div>
        <div className="flex gap-2">
          <button
            onClick={onExport}
            className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Export CSV
          </button>
          <button
            onClick={onClear}
            className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Clear
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="mt-2 text-xs text-slate-600">No entries yet.</div>
      ) : (
        <div className="mt-2 space-y-1 text-xs text-slate-800">
          {entries
            .slice()
            .reverse()
            .map((e, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1"
              >
                <div className="font-mono text-[11px]">
                  {new Date(e.timestamp).toISOString()} — {e.action} — {e.invoiceId}
                </div>
                <div className={e.result === 'ok' ? 'text-emerald-600' : 'text-red-600'}>
                  {e.result} {e.message ? `(${e.message})` : ''}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
