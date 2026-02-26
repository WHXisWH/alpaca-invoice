'use client';

import { Plus, Trash2, Lock, ShieldCheck, RefreshCw } from 'lucide-react';
import JctPdfPreview from '@/components/jct-pdf-preview';
import { useInvoiceForm, type LineItemRow } from '@/controller/Invoice/useInvoiceForm';

export default function InvoiceForm() {
  const form = useInvoiceForm();
  const { audit } = form;

  const formContent = (
    <form
      onSubmit={form.handleSubmit}
      className="surface-card space-y-4 p-3 ring-2 ring-amber-200/80 bg-amber-50/30"
    >
      {/* ── Seller (auto, read-only) ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          Seller address <span className="text-xs text-slate-400">(current wallet)</span>
        </label>
        <div className="rounded-lg border border-primary-200/60 bg-primary-50/70 px-3 py-2 text-sm text-slate-700">
          {form.publicKey || 'Not connected'}
        </div>
      </div>

      {/* ── T number (JCT registration) ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          T number (JCT registration) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={13}
            value={form.tNumber}
            onChange={(e) => form.setTNumber(e.target.value)}
            className="input-field font-mono"
            placeholder="13 digits"
          />
          {form.tNumber.length === 13 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-600" title="Format OK">
              <ShieldCheck className="h-5 w-5" />
            </span>
          )}
        </div>
        {form.errors.tNumber && <p className="text-xs text-red-500">{form.errors.tNumber}</p>}
        <p className="text-xs text-slate-400">
          13-digit registration number (T+13). Required for JCT-compliant invoices.
        </p>
        {form.tNumber.length === 13 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs">
            <p className="text-amber-800">
              Format valid. For official verification, confirm with NTA or use the check below.
            </p>
            <button
              type="button"
              onClick={form.verifyTNumberWithNta}
              disabled={form.ntaCheck === 'checking'}
              className="mt-1.5 rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              {form.ntaCheck === 'checking'
                ? 'Checking…'
                : form.ntaCheck === 'ok'
                ? '✓ NTA verified'
                : 'Verify with NTA (if API configured)'}
            </button>
            {form.ntaCheck === 'unavailable' && (
              <p className="mt-1 text-amber-700">
                For demo purposes, any 13-digit value is accepted. Configure NTA API in production for official verification.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Buyer ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          Buyer address <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={form.buyer}
          onChange={(e) => form.setBuyer(e.target.value)}
          className="input-field"
          placeholder="aleo1..."
        />
        {form.errors.buyer && <p className="text-xs text-red-500">{form.errors.buyer}</p>}
      </div>

      {/* ── Line items ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-800">
            Line items <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={form.addLineItem}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add line item
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-600">
                <th className="px-3 py-2">Description</th>
                <th className="w-20 px-3 py-2">Qty</th>
                <th className="w-24 px-3 py-2">Unit price</th>
                <th className="w-20 px-3 py-2">Amount</th>
                <th className="w-24 px-3 py-2">Tax (JCT)</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {form.lineItems.map((row, i) => {
                const parsed = form.parsedLineItems[i];
                const amount = parsed?.amount ?? 0;
                const lineTaxRate = row.jctTaxRate === '10' ? 0.1 : row.jctTaxRate === '8' ? 0.08 : 0;
                const lineTax = Math.round(amount * lineTaxRate * 100) / 100;
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => form.updateLineItem(row.id, 'description', e.target.value)}
                        className="input-field min-w-0 py-1.5"
                        placeholder="Service, product, etc."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || /^\d*\.?\d*$/.test(v)) form.updateLineItem(row.id, 'quantity', v);
                        }}
                        className="input-field py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.unitPrice}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '' || /^\d*\.?\d*$/.test(v)) form.updateLineItem(row.id, 'unitPrice', v);
                        }}
                        className="input-field py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{amount.toFixed(2)}</td>
                    <td className="px-1 py-2">
                      <select
                        value={row.jctTaxRate}
                        onChange={(e) =>
                          form.updateLineItem(row.id, 'jctTaxRate', e.target.value as LineItemRow['jctTaxRate'])
                        }
                        className="input-field py-1.5 text-sm"
                      >
                        <option value="10">10%</option>
                        <option value="8">8%</option>
                        <option value="0">0%</option>
                      </select>
                      <span className="ml-1 inline-flex items-center text-xs text-slate-500" title="Locked">
                        <Lock className="h-3 w-3" />
                        {lineTax.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => form.removeLineItem(row.id)}
                        disabled={form.lineItems.length <= 1}
                        title="Remove line"
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {form.errors.lineItems && <p className="text-xs text-red-500">{form.errors.lineItems}</p>}
        {form.errors.amount && <p className="text-xs text-red-500">{form.errors.amount}</p>}
      </div>

      {/* ── Subtotal + tax summary ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          Subtotal (Amount) <span className="text-xs text-slate-400">(from line items)</span>
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
          {form.parsedAmount.toFixed(2)} credits
        </div>
        <p className="text-xs text-slate-400">
          Tax (per-line): {form.taxAmount.toFixed(2)} · Total: {form.total.toFixed(2)} credits
        </p>
      </div>

      {/* ── Due date + currency ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            Due date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            required
            value={form.dueDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => form.setDueDate(e.target.value)}
            className="input-field"
          />
          {form.errors.dueDate && <p className="text-xs text-red-500">{form.errors.dueDate}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            Payment currency <span className="text-red-500">*</span>
          </label>
          <select
            value={form.currency}
            onChange={(e) => form.setCurrency(e.target.value)}
            className="input-field"
          >
            <option value="CREDITS">CREDITS</option>
            <option value="USDCx">USDCx</option>
          </select>
          <p className="text-xs text-slate-400">Invoice can be paid in Aleo Credits or USDCx only.</p>
          {form.errors.currency && <p className="text-xs text-red-500">{form.errors.currency}</p>}
        </div>
      </div>

      {/* ── Order ID + memo ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            Order ID <span className="text-xs text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={form.orderId}
            onChange={(e) => form.setOrderId(e.target.value)}
            className="input-field"
            placeholder="PO-12345 or leave blank"
          />
          <p className="text-xs text-slate-400">Auto-generated if empty.</p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            Memo <span className="text-xs text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => form.setNotes(e.target.value)}
            className="input-field"
            placeholder="Payment terms, notes, etc."
          />
        </div>
      </div>

      {/* ── Audit authorization ── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Audit authorization</div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={audit.enableAuditAuth}
              onChange={(e) => audit.setEnableAuditAuth(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            Enable
          </label>
        </div>
        {audit.enableAuditAuth && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Audit key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800">
                  {audit.auditKey || '—'}
                </code>
                <button
                  type="button"
                  onClick={() => audit.generateAuditKey()}
                  title="Generate audit key"
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Click the icon to generate. Store it securely; share only with the auditor.
              </p>
              {form.errors.auditKey && <p className="text-xs text-red-500">{form.errors.auditKey}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Expiry</label>
              <input
                type="date"
                value={audit.expiresAt}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => audit.setExpiresAt(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Scopes</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  'amount', 'tax_amount', 'due_date',
                  'buyer', 'seller', 'currency',
                  'items_hash', 'memo_hash', 'order_id'
                ].map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audit.scopes.includes(s)}
                      onChange={() => audit.toggleScope(s)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Progress indicator ── */}
      {form.isProcessing && (
        <div className="space-y-2 rounded-lg border border-blue-200/60 bg-blue-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">Processing...</span>
            <span className="text-sm text-blue-700">{form.currentProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${form.currentProgress}%` }}
            />
          </div>
          {form.currentLog && <p className="text-xs text-blue-800">{form.currentLog}</p>}
        </div>
      )}

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={form.isProcessing}
        className="w-full cursor-pointer rounded-lg bg-primary-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {form.isProcessing ? 'Processing...' : 'Create Invoice'}
      </button>
    </form>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,380px]">
      <div className="min-w-0">{formContent}</div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <JctPdfPreview
          sellerName={form.publicKey ? `${form.publicKey.slice(0, 12)}…` : '—'}
          sellerTNumber={form.tNumber}
          buyerName={form.buyer.trim() || '—'}
          issueDate={form.dueDate ? new Date(form.dueDate) : new Date()}
          lineItems={form.jctPreviewData.lineItemsV3}
          summary={form.jctPreviewData.summary}
        />
      </div>
    </div>
  );
}
