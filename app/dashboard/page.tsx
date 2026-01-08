'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import InvoiceCard from '@/components/invoice-card';
import { useInvoiceStore } from '@/stores/invoiceStore';
import { useWalletStore } from '@/stores/walletStore';
import WalletConnectButton from '@/components/wallet-connect-button';
import FunctionGuide from '@/components/function-guide';
import { InvoiceStatus } from '@/lib/types';

export default function DashboardPage() {
  const { sentInvoices, receivedInvoices, fetchInvoices } = useInvoiceStore();
  const { connected, address } = useWalletStore();

  useEffect(() => {
    if (connected) {
      fetchInvoices();
    }
  }, [connected, fetchInvoices]);

  // Calculate statistics
  const totalSent = sentInvoices.length;
  const totalReceived = receivedInvoices.length;
  const pendingSent = sentInvoices.filter(inv => inv.status === InvoiceStatus.PENDING).length;
  const pendingReceived = receivedInvoices.filter(inv => inv.status === InvoiceStatus.PENDING).length;
  const paidSent = sentInvoices.filter(inv => inv.status === InvoiceStatus.PAID).length;
  const paidReceived = receivedInvoices.filter(inv => inv.status === InvoiceStatus.PAID).length;

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="text-center space-y-3">
          <div className="text-6xl">🔐</div>
          <h2 className="text-2xl font-bold text-slate-900">Connect Wallet to Get Started</h2>
          <p className="text-slate-600 max-w-md">
            Please connect your Aleo wallet to view and manage your invoices
          </p>
        </div>
        <WalletConnectButton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600 mt-1">
            Address: <code className="text-xs bg-amber-50 px-2 py-1 rounded">{address?.slice(0, 12)}...{address?.slice(-8)}</code>
          </p>
        </div>
        <WalletConnectButton />
      </div>

      {/* Statistics Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white border-2 border-amber-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">Sent</span>
            <span className="text-2xl">📤</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{totalSent}</div>
          <div className="text-xs text-slate-500 mt-1">
            Pending: {pendingSent} | Paid: {paidSent}
          </div>
        </div>

        <div className="rounded-xl bg-white border-2 border-amber-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">Received</span>
            <span className="text-2xl">📥</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{totalReceived}</div>
          <div className="text-xs text-slate-500 mt-1">
            Pending: {pendingReceived} | Paid: {paidReceived}
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 border-2 border-amber-300 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-amber-800">Pending</span>
            <span className="text-2xl">⏳</span>
          </div>
          <div className="text-3xl font-bold text-amber-900">{pendingSent + pendingReceived}</div>
          <div className="text-xs text-amber-700 mt-1">
            Requires action
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-green-100 to-green-50 border-2 border-green-300 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-800">Completed</span>
            <span className="text-2xl">✅</span>
          </div>
          <div className="text-3xl font-bold text-green-900">{paidSent + paidReceived}</div>
          <div className="text-xs text-green-700 mt-1">
            All paid invoices
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="rounded-2xl bg-white border border-amber-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/invoices/create"
            className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 hover:border-amber-400 transition-colors"
          >
            <div className="text-2xl">✏️</div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Create Invoice</div>
              <div className="text-xs text-slate-600">Issue new invoice</div>
            </div>
          </Link>

          <Link
            href="/invoices?filter=pending"
            className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 hover:border-amber-400 transition-colors"
          >
            <div className="text-2xl">💰</div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Pending Payments</div>
              <div className="text-xs text-slate-600">View unpaid invoices</div>
            </div>
          </Link>

          <Link
            href="/receipts"
            className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 hover:border-amber-400 transition-colors"
          >
            <div className="text-2xl">🧾</div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">View Receipts</div>
              <div className="text-xs text-slate-600">All payment receipts</div>
            </div>
          </Link>

          <Link
            href="/audit"
            className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 hover:border-amber-400 transition-colors"
          >
            <div className="text-2xl">🔍</div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Audit Center</div>
              <div className="text-xs text-slate-600">Generate audit keys</div>
            </div>
          </Link>
        </div>
      </section>

      {/* Sent Invoices */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Sent Invoices</h2>
          <Link
            href="/invoices/create"
            className="text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            Create New Invoice →
          </Link>
        </div>

        {sentInvoices.length === 0 ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-8 text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm text-slate-600 mb-4">No sent invoices yet</p>
            <Link
              href="/invoices/create"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
            >
              Create First Invoice
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sentInvoices.slice(0, 4).map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} />
            ))}
          </div>
        )}

        {sentInvoices.length > 4 && (
          <div className="text-center">
            <Link
              href="/invoices?filter=sent"
              className="text-sm text-amber-600 hover:text-amber-700"
            >
              View All {sentInvoices.length} Invoices →
            </Link>
          </div>
        )}
      </section>

      {/* Received Invoices */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Received Invoices</h2>
          <Link
            href="/invoices?filter=received"
            className="text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            View All →
          </Link>
        </div>

        {receivedInvoices.length === 0 ? (
          <div className="rounded-xl bg-white border border-amber-200 p-8 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-sm text-slate-600">No received invoices yet</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {receivedInvoices.slice(0, 4).map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} />
            ))}
          </div>
        )}

        {receivedInvoices.length > 4 && (
          <div className="text-center">
            <Link
              href="/invoices?filter=received"
              className="text-sm text-amber-600 hover:text-amber-700"
            >
              View All {receivedInvoices.length} Invoices →
            </Link>
          </div>
        )}
      </section>

      {/* Function Guide */}
      <section className="mt-12">
        <FunctionGuide />
      </section>
    </div>
  );
}
