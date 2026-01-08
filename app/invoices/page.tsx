'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { InvoiceStatus, type Invoice } from '@/lib/types';
import { useInvoiceStore } from '@/stores/invoiceStore';
import InvoiceCard from '@/components/invoice-card';

const tabs: Array<{ key: 'all' | 'pending' | 'paid' | 'cancelled'; label: string; status?: InvoiceStatus }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending', status: InvoiceStatus.PENDING },
  { key: 'paid', label: 'Paid', status: InvoiceStatus.PAID },
  { key: 'cancelled', label: 'Cancelled', status: InvoiceStatus.CANCELLED }
];

export default function InvoicesPage() {
  const { sentInvoices, receivedInvoices, fetchInvoices, filter, setFilter } = useInvoiceStore();
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const merged = useMemo(() => {
    const map = new Map<string, { invoice: Invoice; role: 'SELLER' | 'BUYER' | 'BOTH' }>();
    sentInvoices.forEach((inv) => map.set(inv.id, { invoice: inv, role: 'SELLER' }));
    receivedInvoices.forEach((inv) => {
      const existing = map.get(inv.id);
      if (existing) {
        map.set(inv.id, { invoice: existing.invoice, role: 'BOTH' });
      } else {
        map.set(inv.id, { invoice: inv, role: 'BUYER' });
      }
    });
    return Array.from(map.values());
  }, [sentInvoices, receivedInvoices]);

  const filtered = merged.filter(({ invoice }) => {
    const matchStatus =
      filter === 'all'
        ? true
        : filter === 'pending'
          ? invoice.status === InvoiceStatus.PENDING
          : filter === 'paid'
            ? invoice.status === InvoiceStatus.PAID
            : invoice.status === InvoiceStatus.CANCELLED;
    const matchSearch =
      search.trim() === '' ||
      invoice.id.toLowerCase().includes(search.trim().toLowerCase()) ||
      invoice.buyer.toLowerCase().includes(search.trim().toLowerCase()) ||
      invoice.seller.toLowerCase().includes(search.trim().toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Invoice manager</h2>
          <p className="text-sm text-slate-600">View pending/paid/cancelled invoices, filter quickly, and open details.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/invoices/create"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Create invoice
          </Link>
          <button
            onClick={() => fetchInvoices()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-300"
          >
            Sync
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              filter === tab.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice ID / buyer / seller address"
          className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500">No matching invoices.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map(({ invoice, role }) => (
          <div key={invoice.id} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{role === 'BOTH' ? 'Buyer & seller' : role === 'SELLER' ? 'Seller view' : 'Buyer view'}</span>
              <Link href={`/invoices/${invoice.id}`} className="text-emerald-600 hover:underline">
                View details
              </Link>
            </div>
            <InvoiceCard invoice={invoice} />
          </div>
        ))}
      </div>
    </div>
  );
}
