'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AleoAddress, AleoField, Invoice, InvoiceDetails, LineItem } from '@/lib/types';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { useInvoiceFormAudit } from '@/controller/Invoice/useInvoiceFormAudit';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';

// ── Helpers ──────────────────────────────────────────────────────────

const ALEO_ADDR_REGEX = /^aleo1[0-9a-z]{58}$/;

/** Tomorrow's date string (YYYY-MM-DD) — safe default for due_date */
function tomorrowDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/** Row state for line item input (amount derived from quantity × unitPrice) */
interface LineItemRow {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

/** Build InvoiceDetails from form inputs. Amount (subtotal) = sum(lineItems), per contract R4. */
function buildDetails(opts: {
  invoiceNumber: string;
  lineItems: LineItem[];
  taxRate: number;
  currency: string;
  orderId: string;
  notes: string;
}): InvoiceDetails {
  const subtotal = opts.lineItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount = Math.round(subtotal * opts.taxRate * 1_000_000) / 1_000_000;
  const total = Math.round((subtotal + taxAmount) * 1_000_000) / 1_000_000;

  return {
    invoiceNumber: opts.invoiceNumber,
    orderId: opts.orderId || undefined,
    lineItems: opts.lineItems.map(({ description, quantity, unitPrice, amount }) => ({
      description: description || 'Item',
      quantity,
      unitPrice,
      amount
    })),
    subtotal,
    taxRate: opts.taxRate,
    taxAmount,
    total,
    currency: opts.currency || 'CREDITS',
    notes: opts.notes || undefined
  };
}

// ── Component ────────────────────────────────────────────────────────

export default function InvoiceForm() {
  const router = useRouter();
  const { executeCreateInvoice, executeSetAuditAuthorization, isProcessing, currentProgress, currentLog } =
    useTransactionController();
  const { publicKey } = useUserStore();
  const { handleError } = useErrorHandler();
  const audit = useInvoiceFormAudit();

  // Pre-warm the Aleo SDK (WASM) and program source on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ps = new AleoProtocolService();
      ps.warmUp().catch(() => {});
    } catch {
      // SDK may not be available yet; ignore — will load on demand later.
    }
  }, []);

  // ── Core invoice fields (aligned with contract create_invoice & Scopes) ──
  const [buyer, setBuyer] = useState('');                              // → buyer (scope)
  const [lineItems, setLineItems] = useState<LineItemRow[]>(() => [
    { id: crypto.randomUUID(), description: 'Service fee', quantity: '1', unitPrice: '1' }
  ]);
  const [taxRatePercent, setTaxRatePercent] = useState('0');            // → tax_amount (scope, user enters %, e.g. 5 = 5%)
  const [dueDate, setDueDate] = useState(tomorrowDateStr);             // → due_date (scope)
  const [currency, setCurrency] = useState('CREDITS');                 // → currency (scope)
  const [orderId, setOrderId] = useState('');                          // → order_id (scope)
  const [notes, setNotes] = useState('');                              // → memo_hash (scope)

  // ── Parsed line items (amount = quantity × unitPrice) ──
  const parsedLineItems = useMemo(
    () =>
      lineItems.map((row) => {
        const qty = parseFloat(row.quantity) || 0;
        const price = parseFloat(row.unitPrice) || 0;
        const amount = Math.round(qty * price * 100) / 100;
        return {
          description: row.description || 'Item',
          quantity: qty,
          unitPrice: price,
          amount
        };
      }),
    [lineItems]
  );

  // ── Amount = subtotal = sum(lineItems), per contract R4 ──
  const parsedAmount = useMemo(
    () => parsedLineItems.reduce((sum, item) => sum + item.amount, 0),
    [parsedLineItems]
  );

  // ── Tax & total ──
  const parsedTaxRatePercent = parseFloat(taxRatePercent) || 0;  // e.g. 5 means 5%
  const parsedTaxRate = parsedTaxRatePercent / 100;               // 0.05
  const taxAmount = Math.round(parsedAmount * parsedTaxRate * 100) / 100;
  const total = Math.round((parsedAmount + taxAmount) * 100) / 100;

  // ── Line items handlers ──
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: 'Service fee', quantity: '1', unitPrice: '1' }
    ]);
  }, []);

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }, []);

  const updateLineItem = useCallback((id: string, field: keyof LineItemRow, value: string) => {
    setLineItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }, []);

  // ── Validation errors ──
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Validate all fields against contract rules. Returns true if valid. */
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const buyerAddr = buyer.trim();

    // Contract: assert_neq(seller, buyer)
    if (!buyerAddr) {
      errs.buyer = 'Buyer address is required.';
    } else if (!ALEO_ADDR_REGEX.test(buyerAddr)) {
      errs.buyer = 'Invalid Aleo address (must be aleo1… 63 chars).';
    } else if (publicKey && buyerAddr === publicKey) {
      errs.buyer = 'Buyer cannot be the same as seller.';
    }

    // Contract: assert(amount > 0u64), R4: line_items_sum == amount
    if (parsedAmount <= 0) {
      errs.amount = 'Add at least one line item with a positive amount.';
    }

    // Per-row: description required, amount > 0
    const hasInvalidLineItem = parsedLineItems.some(
      (item) => !item.description.trim() || item.amount <= 0
    );
    if (hasInvalidLineItem) {
      errs.lineItems = 'Each line item needs a description and a positive amount (quantity × unit price).';
    }

    // Tax rate: 0–100 (percent)
    if (isNaN(parsedTaxRatePercent) || parsedTaxRatePercent < 0 || parsedTaxRatePercent > 100) {
      errs.taxRate = 'Tax rate must be between 0 and 100.';
    }

    // Contract: assert(due_date >= current_time)
    const dueDateObj = new Date(dueDate);
    const nowSec = Math.floor(Date.now() / 1000);
    // Set due_date to end-of-day (23:59:59) so "today" is always valid
    const dueDateSec = Math.floor(dueDateObj.getTime() / 1000) + 86399;
    if (dueDateSec < nowSec) {
      errs.dueDate = 'Due date must be today or in the future.';
    }

    // Currency: non-empty
    if (!currency.trim()) {
      errs.currency = 'Currency is required.';
    }

    // Audit: when enabled, audit key must be generated (64 hex chars)
    if (audit.enableAuditAuth && !audit.isAuditKeyValid()) {
      errs.auditKey = 'Click the icon to generate an audit key before creating.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const buyerAddress = buyer.trim();
    if (buyerAddress !== buyer) setBuyer(buyerAddress);

    const microcredits = BigInt(Math.floor(parsedAmount * 1_000_000));
    const invoiceNumber = `INV-${Date.now()}`;
    const details = buildDetails({
      invoiceNumber,
      lineItems: parsedLineItems,
      taxRate: parsedTaxRate,
      currency: currency.trim(),
      orderId: orderId.trim(),
      notes: notes.trim()
    });

    // Fix due_date: use end-of-day (23:59:59) so "today" won't violate
    // the contract assertion `due_date >= current_time`.
    const dueDateObj = new Date(dueDate);
    dueDateObj.setHours(23, 59, 59, 0);

    try {
      const scopesBitmask = audit.enableAuditAuth ? audit.scopesBitmask : undefined;
      const expiresSec = audit.enableAuditAuth && audit.auditKey ? audit.expiresAtSeconds : undefined;

      const { invoiceHash, invoiceId } = await executeCreateInvoice({
        buyer: buyerAddress as AleoAddress,
        amount: microcredits,
        dueDate: dueDateObj,
        details,
        ...(audit.enableAuditAuth && audit.auditKey && scopesBitmask !== undefined && expiresSec !== undefined && {
          audit: {
            auditKey: audit.normalizedAuditKey,
            scopesBitmask,
            expiresAt: expiresSec
          }
        })
      });

      if (audit.enableAuditAuth && audit.auditKey && scopesBitmask !== undefined && expiresSec !== undefined) {
        try {
          const auditKeyHash = await audit.cryptoService.hashObjectToField(audit.normalizedAuditKey);
          const invoiceForAuth: Invoice = {
            id: invoiceId as AleoField,
            invoiceHash: invoiceHash as AleoField,
            seller: publicKey as AleoAddress,
            buyer: buyerAddress as AleoAddress,
            amount: microcredits,
            dueDate: dueDateObj,
            createdAt: new Date(),
            status: 0,
            metadata: {
              confirmationStatus: 'SENDING',
              lastUpdated: new Date(),
              dataSource: 'local',
              action: 'create'
            }
          };
          await executeSetAuditAuthorization(
            invoiceForAuth,
            auditKeyHash,
            scopesBitmask,
            expiresSec
          );
        } catch (authErr: any) {
          console.warn('Audit authorization not set:', authErr?.message ?? authErr);
        }
      }

      router.push(`/invoices/${invoiceHash}`);
    } catch (err) {
      handleError(err);
    }
  };

  // ── Render ──
  return (
    <form onSubmit={handleSubmit} className="surface-card space-y-4 p-6">
      {/* ── seller (auto, read-only) ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          Seller address <span className="text-xs text-slate-400">(current wallet)</span>
        </label>
        <div className="rounded-lg border border-primary-200/60 bg-primary-50/70 px-3 py-2 text-sm text-slate-700">
          {publicKey || 'Not connected'}
        </div>
      </div>

      {/* ── buyer ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Buyer address <span className="text-red-500">*</span></label>
        <input
          type="text"
          required
          value={buyer}
          onChange={(e) => setBuyer(e.target.value)}
          className="input-field"
          placeholder="aleo1..."
        />
        {errors.buyer && <p className="text-xs text-red-500">{errors.buyer}</p>}
      </div>

      {/* ── Line Items (R4: amount = sum(lineItems)) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-800">Line items <span className="text-red-500">*</span></label>
          <button
            type="button"
            onClick={addLineItem}
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
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((row) => {
                const qty = parseFloat(row.quantity) || 0;
                const price = parseFloat(row.unitPrice) || 0;
                const amount = Math.round(qty * price * 100) / 100;
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateLineItem(row.id, 'description', e.target.value)}
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
                          if (v === '' || /^\d*\.?\d*$/.test(v)) updateLineItem(row.id, 'quantity', v);
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
                          if (v === '' || /^\d*\.?\d*$/.test(v)) updateLineItem(row.id, 'unitPrice', v);
                        }}
                        className="input-field py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{amount.toFixed(2)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeLineItem(row.id)}
                        disabled={lineItems.length <= 1}
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
        {errors.lineItems && <p className="text-xs text-red-500">{errors.lineItems}</p>}
        {errors.amount && <p className="text-xs text-red-500">{errors.amount}</p>}
      </div>

      {/* ── Subtotal (Amount) + Tax rate ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">
            Subtotal (Amount) <span className="text-xs text-slate-400">(from line items)</span>
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
            {parsedAmount.toFixed(2)} credits
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Tax rate (%)</label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={taxRatePercent}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d*$/.test(v)) setTaxRatePercent(v);
              }}
              className="input-field pr-8"
              placeholder="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
          </div>
          {errors.taxRate && <p className="text-xs text-red-500">{errors.taxRate}</p>}
          <p className="text-xs text-slate-400">
            Tax: {taxAmount.toFixed(2)} · Total: {total.toFixed(2)} credits
          </p>
        </div>
      </div>

      {/* ── due_date + currency (side by side) ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Due date <span className="text-red-500">*</span></label>
          <input
            type="date"
            required
            value={dueDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setDueDate(e.target.value)}
            className="input-field"
          />
          {errors.dueDate && <p className="text-xs text-red-500">{errors.dueDate}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Currency <span className="text-red-500">*</span></label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="input-field"
          >
            <option value="CREDITS">CREDITS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="CNY">CNY</option>
            <option value="USDT">USDT</option>
          </select>
          {errors.currency && <p className="text-xs text-red-500">{errors.currency}</p>}
        </div>
      </div>

      {/* ── order_id + memo (side by side) ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Order ID <span className="text-xs text-slate-400">(optional)</span></label>
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="input-field"
            placeholder="PO-12345 or leave blank"
          />
          <p className="text-xs text-slate-400">Auto-generated if empty.</p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Memo <span className="text-xs text-slate-400">(optional)</span></label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-field"
            placeholder="Payment terms, notes, etc."
          />
        </div>
      </div>

      {/* ── Audit authorization (collapsible) ── */}
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
              <p className="text-xs text-slate-500">Click the icon to generate. Store it securely; share only with the auditor.</p>
              {errors.auditKey && <p className="text-xs text-red-500">{errors.auditKey}</p>}
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
      {isProcessing && (
        <div className="space-y-2 rounded-lg border border-blue-200/60 bg-blue-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">Processing...</span>
            <span className="text-sm text-blue-700">{currentProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${currentProgress}%` }}
            />
          </div>
          {currentLog && (
            <p className="text-xs text-blue-800">{currentLog}</p>
          )}
        </div>
      )}

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={isProcessing}
        className="w-full cursor-pointer rounded-lg bg-primary-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isProcessing ? 'Processing...' : 'Create Invoice'}
      </button>
    </form>
  );
}
