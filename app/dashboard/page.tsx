'use client';

import Link from 'next/link';
import Image from 'next/image';
import InvoiceCard from '@/components/invoice-card';
import { EmptyState } from '@/components/ui/empty-state';
import { useInvoices } from '@/controller/Invoice/useInvoices';
import { InvoiceStatus } from '@/lib/types';
import {
  Send,
  Inbox,
  Clock,
  CheckCircle,
  FilePlus,
  CreditCard,
  Receipt,
  Search,
  ArrowRight,
  Wallet,
  Loader2,
} from 'lucide-react';

export default function DashboardPage() {
  const {
    receivedInvoices,
    sentInvoices,
    pending,
    complete,
    showLoading,
    showWalletPrompt,
    isInvoiceProcessing,
    isInvoiceSyncing,
  } = useInvoices();

  // 统计数据
  const stats = {
    totalSent: sentInvoices.length,
    totalReceived: receivedInvoices.length,
    pendingSent: sentInvoices.filter(
      (item) => item.invoice.status === InvoiceStatus.PENDING
    ).length,
    pendingReceived: receivedInvoices.filter(
      (item) => item.invoice.status === InvoiceStatus.PENDING
    ).length,
    paidSent: sentInvoices.filter(
      (item) => item.invoice.status === InvoiceStatus.PAID
    ).length,
    paidReceived: receivedInvoices.filter(
      (item) => item.invoice.status === InvoiceStatus.PAID
    ).length,
    totalPending: pending.length,
    totalComplete: complete.length,
  };

  // 显示加载状态
  if (showLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        <p className="mt-4 text-sm text-primary-500">Loading invoices...</p>
      </div>
    );
  }

  // 显示钱包连接提示
  if (showWalletPrompt) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="rounded-2xl border border-primary-200 bg-white p-10 text-center shadow-sm">
          <div className="relative mx-auto mb-6 h-32 w-32">
            <Image
              src="/images/mascot/mascot-waiting.png"
              alt="Connect wallet"
              fill
              className="object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-accent-100 mb-4">
            <Wallet className="h-6 w-6 text-accent-600" />
          </div>
          <h2 className="text-xl font-bold text-primary-900">Connect Wallet</h2>
          <p className="mt-2 text-sm text-primary-500 max-w-xs">
            Connect your Aleo wallet to view and manage your invoices
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-info-100">
              <Send className="h-6 w-6 text-info-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-900">{stats.totalSent}</p>
              <p className="text-sm text-primary-500">Sent</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-primary-400">
            Pending: {stats.pendingSent} · Paid: {stats.paidSent}
          </p>
        </div>

        <div className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100">
              <Inbox className="h-6 w-6 text-accent-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-900">{stats.totalReceived}</p>
              <p className="text-sm text-primary-500">Received</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-primary-400">
            Pending: {stats.pendingReceived} · Paid: {stats.paidReceived}
          </p>
        </div>

        <div className="rounded-xl border border-warning-200 bg-warning-50 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-100">
              <Clock className="h-6 w-6 text-warning-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-warning-900">{stats.totalPending}</p>
              <p className="text-sm text-warning-700">Pending</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-warning-600">Requires action</p>
        </div>

        <div className="rounded-xl border border-success-200 bg-success-50 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-100">
              <CheckCircle className="h-6 w-6 text-success-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success-900">{stats.totalComplete}</p>
              <p className="text-sm text-success-700">Completed</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-success-600">Paid invoices</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-primary-900">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/invoices/create"
            className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 transition-all hover:border-accent-300 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-100">
              <FilePlus className="h-5 w-5 text-accent-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900">Create Invoice</div>
              <div className="text-xs text-primary-500">Issue new invoice</div>
            </div>
          </Link>

          <Link
            href="/invoices?filter=pending"
            className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 transition-all hover:border-warning-300 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-100">
              <CreditCard className="h-5 w-5 text-warning-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900">Pending</div>
              <div className="text-xs text-primary-500">View pending invoices</div>
            </div>
          </Link>

          <Link
            href="/receipts"
            className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 transition-all hover:border-success-300 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-100">
              <Receipt className="h-5 w-5 text-success-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900">Receipts</div>
              <div className="text-xs text-primary-500">View payment receipts</div>
            </div>
          </Link>

          <Link
            href="/audit"
            className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 transition-all hover:border-info-300 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-100">
              <Search className="h-5 w-5 text-info-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-900">Audit</div>
              <div className="text-xs text-primary-500">Generate audit keys</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Sent Invoices */}
      <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary-900">Sent Invoices</h2>
          <Link
            href="/invoices/create"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700"
          >
            Create New
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {sentInvoices.length === 0 ? (
          <EmptyState
            mascot="sleeping"
            title="No sent invoices"
            description="Create your first invoice to get started"
            action={
              <Link
                href="/invoices/create"
                className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-600"
              >
                <FilePlus className="h-4 w-4" />
                Create Invoice
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sentInvoices.slice(0, 4).map((item) => (
              <InvoiceCard
                key={item.invoice.id}
                invoice={item.invoice}
                role={item.role}
                statusConfig={item.statusConfig}
                isProcessing={isInvoiceProcessing(item.invoice.id)}
                isSyncing={isInvoiceSyncing(item.invoice)}
              />
            ))}
          </div>
        )}

        {sentInvoices.length > 4 && (
          <div className="mt-4 text-center">
            <Link
              href="/invoices?filter=sent"
              className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800"
            >
              View All {sentInvoices.length} Invoices
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Received Invoices */}
      <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary-900">Received Invoices</h2>
          <Link
            href="/invoices?filter=received"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700"
          >
            View All
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {receivedInvoices.length === 0 ? (
          <EmptyState
            mascot="sleeping"
            title="No received invoices"
            description="Invoices sent to you will appear here"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {receivedInvoices.slice(0, 4).map((item) => (
              <InvoiceCard
                key={item.invoice.id}
                invoice={item.invoice}
                role={item.role}
                statusConfig={item.statusConfig}
                isProcessing={isInvoiceProcessing(item.invoice.id)}
                isSyncing={isInvoiceSyncing(item.invoice)}
              />
            ))}
          </div>
        )}

        {receivedInvoices.length > 4 && (
          <div className="mt-4 text-center">
            <Link
              href="/invoices?filter=received"
              className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800"
            >
              View All {receivedInvoices.length} Invoices
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
