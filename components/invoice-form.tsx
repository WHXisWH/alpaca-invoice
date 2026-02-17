'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AleoAddress, AleoField, InvoiceDetails } from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';

// ── Helpers ──────────────────────────────────────────────────────────

const ALEO_ADDR_REGEX = /^aleo1[0-9a-z]{58}$/;

/** Tomorrow's date string (YYYY-MM-DD) — safe default for due_date */
function tomorrowDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/** Build InvoiceDetails from form inputs */
function buildDetails(opts: {
  invoiceNumber: string;
  description: string;
  amountCredits: number;
  taxRate: number;
  currency: string;
  orderId: string;
  notes: string;
}): InvoiceDetails {
  const subtotal = Math.round(opts.amountCredits * 1_000_000) / 1_000_000;
  const taxAmount = Math.round(subtotal * opts.taxRate * 1_000_000) / 1_000_000;
  const total = Math.round((subtotal + taxAmount) * 1_000_000) / 1_000_000;

  return {
    invoiceNumber: opts.invoiceNumber,
    orderId: opts.orderId || undefined,
    lineItems: [
      {
        description: opts.description || 'Service',
        quantity: 1,
        unitPrice: subtotal,
        amount: subtotal
      }
    ],
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
  const cryptoService = useMemo(() => new CryptoService(), []);

  // Pre-warm the Aleo SDK (WASM) and program source on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // Instantiate to trigger lazy WASM initialization
      new AleoProtocolService();
    } catch {
      // SDK may not be available yet; ignore — will load on demand later.
    }
  }, []);

  // ── Core invoice fields (aligned with contract create_invoice & Scopes) ──
  const [buyer, setBuyer] = useState('');                              // → buyer (scope)
  const [amount, setAmount] = useState('1');                           // → amount (scope)
  const [taxRatePercent, setTaxRatePercent] = useState('0');            // → tax_amount (scope, user enters %, e.g. 5 = 5%)
  const [dueDate, setDueDate] = useState(tomorrowDateStr);             // → due_date (scope)
  const [description, setDescription] = useState('Service fee');       // → items_hash (scope, via lineItems)
  const [currency, setCurrency] = useState('CREDITS');                 // → currency (scope)
  const [orderId, setOrderId] = useState('');                          // → order_id (scope)
  const [notes, setNotes] = useState('');                              // → memo_hash (scope)

  // ── Derived display values ──
  const parsedAmount = parseFloat(amount) || 0;
  const parsedTaxRatePercent = parseFloat(taxRatePercent) || 0;  // e.g. 5 means 5%
  const parsedTaxRate = parsedTaxRatePercent / 100;               // 0.05
  const taxAmount = Math.round(parsedAmount * parsedTaxRate * 100) / 100;
  const total = Math.round((parsedAmount + taxAmount) * 100) / 100;

  // ── Audit authorization (optional) ──
  const [enableAuditAuth, setEnableAuditAuth] = useState(false);
  const [auditKey, setAuditKey] = useState('');
  const [scopes, setScopes] = useState<string[]>(['amount', 'tax_amount', 'buyer', 'seller']);
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );

  const toggleScope = (key: string) => {
    setScopes((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  };

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

    // Contract: assert(amount > 0u64)
    if (parsedAmount <= 0) {
      errs.amount = 'Amount must be greater than 0.';
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
      description,
      amountCredits: parsedAmount,
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
      const invoiceHash = await executeCreateInvoice({
        buyer: buyerAddress as AleoAddress,
        amount: microcredits,
        dueDate: dueDateObj,
        details
      });

      // Optional: set audit authorization after invoice is on-chain
      if (enableAuditAuth) {
        try {
          const scopesBitmask = scopes.reduce((mask, key) => {
            const ids: Record<string, number> = {
              amount: 1, tax_amount: 2, due_date: 3, buyer: 4, seller: 5,
              currency: 6, items_hash: 7, memo_hash: 8, order_id: 9
            };
            const id = ids[key];
            return id ? mask | (1n << BigInt(id - 1)) : mask;
          }, 0n);
          const auditKeyHash = await cryptoService.hashObjectToField(auditKey || 'audit-key');
          const expiresSec = Math.floor(new Date(expiresAt).getTime() / 1000);
          await executeSetAuditAuthorization(
            {
              id: invoiceHash as AleoField,
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
            } as any,
            auditKeyHash,
            scopesBitmask,
            expiresSec
          );
        } catch (authErr) {
          console.warn('Audit authorization not set:', authErr);
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

      {/* ── amount + tax_rate (side by side) ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Amount (credits) <span className="text-red-500">*</span></label>
          <input
            type="number"
            min="0"
            step="any"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field"
            placeholder="1.00"
          />
          {errors.amount && <p className="text-xs text-red-500">{errors.amount}</p>}
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

      {/* ── description (→ items_hash) ── */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Description <span className="text-xs text-slate-400">(line items)</span></label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field"
          placeholder="Service fee, consulting, etc."
        />
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
              checked={enableAuditAuth}
              onChange={(e) => setEnableAuditAuth(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            Enable
          </label>
        </div>
        {enableAuditAuth && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Audit key</label>
              <input
                type="text"
                value={auditKey}
                onChange={(e) => setAuditKey(e.target.value)}
                className="input-field"
                placeholder="Random string or hex"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Expiry</label>
              <input
                type="date"
                value={expiresAt}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setExpiresAt(e.target.value)}
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
                      checked={scopes.includes(s)}
                      onChange={() => toggleScope(s)}
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
