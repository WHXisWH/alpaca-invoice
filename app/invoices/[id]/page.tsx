'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInvoiceStore } from '@/stores/invoiceStore';
import InvoiceCard from '@/components/invoice-card';
import { useParams } from 'next/navigation';

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = useMemo(
    () => (Array.isArray(params?.id) ? params.id[0] : (params?.id as string)),
    [params]
  );
  const { sentInvoices, receivedInvoices, fetchInvoices } = useInvoiceStore();
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const invoice =
    sentInvoices.find((i) => i.id === invoiceId) ||
    receivedInvoices.find((i) => i.id === invoiceId) ||
    null;

  if (!invoice) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        <p className="text-sm text-slate-600">Not found: {invoiceId}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
      <InvoiceCard invoice={invoice} />
      {invoice.details && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Line items</div>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {invoice.details.lineItems.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <span>{item.description}</span>
                <span>
                  {item.quantity} x {item.unitPrice} = {item.amount}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-sm text-slate-700">
            Total: {invoice.details.total} {invoice.details.currency}
          </div>
        </div>
      )}
      {message && <p className="text-sm text-emerald-600">{message}</p>}
    </div>
  );
}
