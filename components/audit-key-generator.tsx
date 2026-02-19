'use client';

import { useAuditPackageGenerate } from '@/controller/Audit/useAuditPackageGenerate';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';

export default function AuditKeyGenerator() {
  const { isAuthRequired, handleUnlock, isRequestingAuth } = useAuthCheck();
  const {
    invoices,
    invoiceId,
    expiresAt,
    fields,
    result,
    keyCopied,
    setInvoiceId,
    setExpiresAt,
    toggleField,
    loadInvoiceOptions,
    downloadResult,
    copyAuditKey,
    handleSubmit,
    loading,
    loadingInvoices,
    fieldsList
  } = useAuditPackageGenerate();

  const resultSidebar = result ? (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">Audit Package Result</div>
      <div className="space-y-3 text-sm text-slate-800">
        <div>
          <div className="mb-1 font-medium text-slate-700">Encrypted package (envelope)</div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            {JSON.stringify(result.envelope, null, 2)}
          </pre>
        </div>
        <div className="space-y-1">
          <div className="font-medium text-slate-700">Audit Key (give to auditor; keep private)</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
              {result.auditKey}
            </code>
            <button
              type="button"
              onClick={copyAuditKey}
              className="shrink-0 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {keyCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadResult}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Download envelope JSON
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div
      className={
        result
          ? 'grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(320px,400px)]'
          : 'block'
      }
    >
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {isAuthRequired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Please authorize to decrypt local invoice data</p>
            <p className="mt-1 text-amber-700">
              Generating audit packages requires decrypting local invoice details. Please complete signature authorization first.
            </p>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={isRequestingAuth}
              className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {isRequestingAuth ? 'Authorizing…' : 'Authorize'}
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="text-sm font-semibold text-slate-900">Generate Audit Package</div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Select or paste an invoice ID</span>
            <button
              type="button"
              onClick={loadInvoiceOptions}
              disabled={loadingInvoices}
              className="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingInvoices ? 'Loading…' : 'Refresh list'}
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800">Invoice ID</label>
            <select
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="">-- Choose from local invoices --</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.id} ({inv.invoiceHash})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              placeholder="Or paste invoice ID / invoice hash"
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
            <div className="text-sm font-medium text-slate-800">Fields to disclose</div>
            <div className="grid grid-cols-2 gap-2">
              {fieldsList.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={fields.includes(p.key)}
                    onChange={() => toggleField(p.key)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || isAuthRequired}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </form>
      </div>

      {resultSidebar}
    </div>
  );
}
