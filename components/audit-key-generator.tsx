'use client';

import { useMemo, useState } from 'react';
import { useAuditController } from '@/controller/Audit/useAuditController';
import type { AleoField } from '@/lib/types';
import type { AuditPackage } from '@/types/audit-package';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';

export default function AuditKeyGenerator() {
  const { generate, downloadPackage, loading } = useAuditController();
  const { getAllInvoices } = useInvoiceStore.getState();
  const [invoices, setInvoices] = useState<{ id: AleoField; invoiceHash: AleoField }[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [fields, setFields] = useState<string[]>([
    'amount',
    'tax_amount',
    'buyer',
    'seller',
    'due_date'
  ]);
  const [result, setResult] = useState<AuditPackage | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const fieldsList = useMemo(
    () => [
      { key: 'amount', label: 'Amount' },
      { key: 'tax_amount', label: 'Tax amount' },
      { key: 'due_date', label: 'Due date' },
      { key: 'buyer', label: 'Buyer' },
      { key: 'seller', label: 'Seller' },
      { key: 'currency', label: 'Currency' },
      { key: 'items_hash', label: 'Items hash' },
      { key: 'memo_hash', label: 'Memo hash' },
      { key: 'order_id', label: 'Order ID' }
    ],
    []
  );

  const loadInvoices = async () => {
    setLoadingList(true);
    try {
      const list = await getAllInvoices({ refreshMemory: true });
      setInvoices(
        list.map((inv) => ({
          id: inv.id,
          invoiceHash: inv.invoiceHash
        }))
      );
    } finally {
      setLoadingList(false);
    }
  };

  const toggleField = (key: string) => {
    setFields((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const handleDownload = () => {
    if (!result) return;
    downloadPackage(result, result.invoice_id);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    try {
      const pkg = await generate({
        invoiceId: invoiceId.trim() as AleoField,
        expiresAt: new Date(expiresAt).getTime(),
        selectedFields: fields
      });
      setResult(pkg);
    } catch (err: any) {
      // Error is already handled by unified error handler
      // Just prevent further execution
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <form onSubmit={handleGenerate} className="space-y-3">
        <div className="text-sm font-semibold text-slate-900">Generate Audit Package</div>
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Select or paste an invoice ID</span>
          <button
            type="button"
            onClick={loadInvoices}
            disabled={loadingList}
            className="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loadingList ? 'Loading…' : 'Refresh list'}
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
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </form>

      {result && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
          <div className="font-semibold text-slate-900">Audit Package JSON</div>
          <pre className="max-h-56 overflow-auto rounded border border-slate-200 bg-white p-2 text-xs">
            {JSON.stringify(result, null, 2)}
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
