'use client';

import Link from 'next/link';
import { InvoiceStatus } from '@/lib/types';
import { useInvoices } from '@/controller/Invoice/useInvoices';
import InvoiceCard, { type StatusConfig } from '@/components/invoice-card';

const tabs: Array<{ key: 'all' | 'pending' | 'paid' | 'cancelled'; label: string; status?: InvoiceStatus }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending', status: InvoiceStatus.PENDING },
  { key: 'paid', label: 'Paid', status: InvoiceStatus.PAID },
  { key: 'cancelled', label: 'Cancelled', status: InvoiceStatus.CANCELLED }
];

function getStatusConfig(status: InvoiceStatus): StatusConfig {
  switch (status) {
    case InvoiceStatus.PENDING:
      return {
        label: 'Pending',
        icon: '⏳',
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-300'
      };
    case InvoiceStatus.PAID:
      return {
        label: 'Paid',
        icon: '✅',
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-300'
      };
    case InvoiceStatus.CANCELLED:
      return {
        label: 'Cancelled',
        icon: '❌',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
    case InvoiceStatus.EXPIRED:
      return {
        label: 'Expired',
        icon: '⚠️',
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-300'
      };
    default:
      return {
        label: 'Unknown',
        icon: '❓',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
  }
}

export default function InvoicesPage() {
  // Use new architecture: useInvoices hook (contains all business logic)
  const {
    filteredInvoices,
    filter,
    search,
    isLoading,
    isSyncing,
    showAuthModal,
    showLoading,
    showWalletPrompt,
    showMainContent,
    setFilter,
    setSearch,
    handleUnlock,
    refresh,
    handleSyncAll,
    handlePay,
    handleCancel
  } = useInvoices();

  // Authorization modal UI (business logic in Controller)
  if (showAuthModal) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <div className="space-y-4 text-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Unlock Private Data</h3>
              <p className="mt-2 text-sm text-slate-600">
                Your signature is required to decrypt locally stored invoice data
              </p>
            </div>
            <button
              onClick={handleUnlock}
              disabled={isLoading}
              className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state (business logic in Controller)
  if (showLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-900 border-r-transparent"></div>
          <p className="text-sm text-slate-600">Loading invoice data...</p>
        </div>
      </div>
    );
  }

  // Wallet connection prompt (business logic in Controller)
  if (showWalletPrompt) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Invoice manager</h2>
            <p className="text-sm text-slate-600">View pending/paid/cancelled invoices, filter quickly, and open details.</p>
          </div>
        </div>
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-slate-200 bg-white">
          <p className="text-sm text-slate-500">Please connect your wallet to view invoices.</p>
        </div>
      </div>
    );
  }

  // Main content (business logic in Controller)
  if (!showMainContent) {
    return null;
  }

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
            onClick={handleSyncAll}
            disabled={isSyncing || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Sync latest status from chain for all invoices"
          >
            <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isSyncing ? 'Syncing...' : 'Sync All'}
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
          placeholder="Search invoice ID / hash / buyer / seller address"
          className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>

      {filteredInvoices.length === 0 && (
        <p className="text-sm text-slate-500">No matching invoices.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filteredInvoices.map(({ invoice, role }) => (
          <div key={invoice.id} className="space-y-2">
            <div className="flex items-center justify-start text-xs text-slate-500">
              <span>
                {role === 'BOTH' ? 'Buyer & seller' : role === 'SELLER' ? 'Seller view' : 'Buyer view'}
              </span>
            </div>
            <InvoiceCard 
              invoice={invoice}
              role={role}
              statusConfig={getStatusConfig(invoice.status)}
              isLoading={isLoading}
              onPay={handlePay}
              onCancel={handleCancel}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
