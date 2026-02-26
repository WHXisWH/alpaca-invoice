'use client';

import { useAuditPackageGenerate } from '@/controller/Audit/useAuditPackageGenerate';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import { RefreshCw, Download, Key, Calendar, User } from 'lucide-react';

function formatMicrocredits(n: bigint): string {
  return (Number(n) / 1_000_000).toFixed(2);
}

export default function AuditCenterV3() {
  const { isAuthRequired, handleUnlock, isRequestingAuth } = useAuthCheck();
  const {
    role,
    setRole,
    availableRecords,
    toggleRecord,
    selectAll,
    deselectAll,
    selectionSummary,
    expiresAt,
    setExpiresAt,
    loading,
    loadAvailableRecords,
    generateV3FromSelection,
    resultV3,
    downloadResult,
    copyAuditKey,
    keyCopied,
    submitOnChainAuthorization,
    submittingAuth,
    setTNumberHint
  } = useAuditPackageGenerate();

  if (isAuthRequired) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="font-medium text-amber-900">Authorize to access local invoice and receipt data</p>
        <button
          type="button"
          onClick={handleUnlock}
          disabled={isRequestingAuth}
          className="mt-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {isRequestingAuth ? 'Authorizing…' : 'Unlock'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Generate Audit Package (Wave 3)</h2>
      <p className="text-sm text-slate-600">
        Choose your role, select records, set expiry, then generate a JSON package and Audit Key for the auditor.
      </p>

      {/* Role selection */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <User className="h-4 w-4" />
          Role
        </label>
        <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          <button
            type="button"
            onClick={() => setRole('buyer')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              role === 'buyer' ? 'bg-primary-100 text-primary-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Buyer (PaymentRecord)
          </button>
          <button
            type="button"
            onClick={() => setRole('seller')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              role === 'seller' ? 'bg-primary-100 text-primary-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Seller (PAID InvoiceRecord)
          </button>
        </div>
      </div>

      {role && (
        <>
          {/* Record list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">
                {role === 'buyer' ? 'Payment records' : 'PAID invoices'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => loadAvailableRecords(role)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="inline h-3 w-3 mr-1" /> Refresh
                </button>
                <button type="button" onClick={selectAll} className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  Select all
                </button>
                <button type="button" onClick={deselectAll} className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  Clear
                </button>
              </div>
            </div>
            <ul className="max-h-48 overflow-auto rounded-lg border border-slate-200">
              {availableRecords.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-slate-500">No records. Sync invoices and payments first.</li>
              ) : (
                availableRecords.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={() => toggleRecord(r.id)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600"
                    />
                    <code className="flex-1 truncate text-xs text-slate-700">{String(r.id).slice(0, 24)}…</code>
                    <span className="text-xs font-medium text-slate-600">{formatMicrocredits(r.amount)}</span>
                    {r.paidAt && <span className="text-xs text-slate-500">{r.paidAt.toLocaleDateString()}</span>}
                  </li>
                ))
              )}
            </ul>
          </div>

          {role === 'seller' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">T number (optional, for auditor identity hint)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={13}
                placeholder="13 digits"
                onChange={(e) => setTNumberHint(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Expiry */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Calendar className="h-4 w-4" />
              Expiry date
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(new Date(e.target.value).getTime() / 1000)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          {/* Bottom drawer: selection summary */}
          {selectionSummary.count > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm">
              <p className="font-medium text-amber-900">Selection summary</p>
              <p className="mt-1 text-amber-800">
                {selectionSummary.count} record(s) · Total: {formatMicrocredits(selectionSummary.totalAmount)} credits
                {role === 'seller' && selectionSummary.totalTax > 0n && ` · Tax: ${formatMicrocredits(selectionSummary.totalTax)}`}
              </p>
            </div>
          )}

          {/* Generate */}
          <button
            type="button"
            onClick={() => generateV3FromSelection()}
            disabled={loading || selectionSummary.count === 0}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating…' : 'Generate audit package'}
          </button>
        </>
      )}

      {/* Result: download + Audit Key + submit on chain */}
      {resultV3 && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="font-semibold text-emerald-900">Package generated</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
              {resultV3.auditKey}
            </code>
            <button
              type="button"
              onClick={copyAuditKey}
              className="shrink-0 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {keyCopied ? 'Copied' : 'Copy key'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={downloadResult}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={submitOnChainAuthorization}
              disabled={submittingAuth}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Key className="h-4 w-4" />
              {submittingAuth ? 'Submitting…' : 'Submit on-chain authorization'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
