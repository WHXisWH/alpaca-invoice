'use client';

import { useEffect } from 'react';
import { useInvoiceStore } from '@/stores/invoiceStore';

export default function ReceiptViewer() {
  const { paymentReceipts } = useInvoiceStore();

  useEffect(() => {
    // receipts already updated via store when payInvoice is called
  }, []);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">Payment receipts</div>
      {paymentReceipts.length === 0 && (
        <p className="text-sm text-slate-500">No receipts yet.</p>
      )}
      <div className="space-y-3">
        {paymentReceipts.map((r) => (
          <div key={r.paymentId} className="rounded-lg border border-slate-100 p-3">
            <div className="text-xs text-slate-500">Payment ID: {r.paymentId}</div>
            <div className="text-sm text-slate-700">
              Amount: {(Number(r.amount) / 1_000_000).toFixed(2)} credits
            </div>
            <div className="text-xs text-slate-500">
              Buyer: {r.payer.slice(0, 12)}... → Seller: {r.payee.slice(0, 12)}...
            </div>
            <div className="text-xs text-slate-500">
              Time: {r.paidAt.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
