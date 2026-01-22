'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useInvoices } from '@/controller/Invoice/useInvoices';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import InvoiceCard from '@/components/invoice-card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FilePlus,
  RefreshCw,
  Loader2,
  Shield,
  Wallet,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const tabs: Array<{ key: 'all' | 'pending' | 'paid' | 'cancelled'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' }
];

export default function InvoicesPage() {
  const { isAuthRequired, handleUnlock } = useAuthCheck();
  const {
    filteredInvoices,
    filter,
    search,
    isLoading,
    isSyncing,
    showLoading,
    showWalletPrompt,
    showMainContent,
    setFilter,
    setSearch,
    handleSyncAll,
    handlePay,
    handleCancel,
    isInvoiceProcessing,
    isInvoiceSyncing
  } = useInvoices();

  // 仅在链上确认后允许操作
  const guardActionByChainStatus = (
    chainStatus: 'SENDING' | 'CONFIRMED' | null | undefined,
    actionName: 'pay' | 'cancel'
  ) => {
    if (chainStatus !== 'CONFIRMED') {
      toast.warning('Not ready yet', {
        description:
          actionName === 'pay'
            ? 'This invoice is still sending. Please wait for chain confirmation (or click Sync) before paying.'
            : 'This invoice is still sending. Please wait for chain confirmation (or click Sync) before cancelling.'
      });
      return false;
    }
    return true;
  };

  // Authorization modal
  if (isAuthRequired) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="rounded-xl border border-primary-200 bg-white p-8 text-center shadow-sm">
          <div className="relative mx-auto mb-4 h-20 w-20">
            <Image
              src="/images/mascot/mascot-shield.png"
              alt="Unlock"
              fill
              className="object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100">
            <Shield className="h-6 w-6 text-accent-600" />
          </div>
          <h3 className="text-lg font-semibold text-primary-900">Unlock Private Data</h3>
          <p className="mt-2 text-sm text-primary-500">
            Signature required to decrypt invoice data
          </p>
          <button
            onClick={handleUnlock}
            disabled={isLoading}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Unlock'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (showLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-20 w-20">
            <Image
              src="/images/mascot/mascot-thinking.png"
              alt="Loading"
              fill
              className="animate-pulse object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
          <p className="text-sm text-primary-500">Loading invoices...</p>
        </div>
      </div>
    );
  }

  // Wallet connection prompt
  if (showWalletPrompt) {
    return (
      <div className="rounded-xl border border-primary-200 bg-white p-8 shadow-sm">
        <EmptyState
          icon={Wallet}
          title="Connect Wallet"
          description="Connect your Aleo wallet to view and manage invoices"
        />
      </div>
    );
  }

  if (!showMainContent) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/invoices/create"
          className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-600"
        >
          <FilePlus className="h-4 w-4" />
          Create Invoice
        </Link>
        <button
          onClick={handleSyncAll}
          disabled={isSyncing || isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 py-2.5 text-sm font-medium text-primary-700 shadow-sm transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Sync status from chain"
        >
          <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
          {isSyncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              filter === tab.key
                ? 'bg-primary-800 text-white'
                : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, hash, or address..."
          className="w-full max-w-md rounded-lg border border-primary-200 bg-white px-4 py-2.5 text-sm text-primary-900 placeholder:text-primary-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
        />
      </div>

      {/* Invoice list */}
      {filteredInvoices.length === 0 ? (
        <div className="rounded-xl border border-primary-200 bg-white p-8 shadow-sm">
          <EmptyState
            icon={FileText}
            mascot="sleeping"
            title="No invoices found"
            description={search ? 'Try adjusting your search terms' : 'Create your first invoice to get started'}
            action={
              !search && (
                <Link
                  href="/invoices/create"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-600"
                >
                  <FilePlus className="h-4 w-4" />
                  Create Invoice
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredInvoices.map(({ invoice, role, chainStatus, statusConfig }) => {
            const isProcessing = isInvoiceProcessing(invoice.id);
            const isSyncingInvoice = isInvoiceSyncing ? isInvoiceSyncing(invoice) : chainStatus === 'SENDING';

            return (
              <div key={invoice.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-primary-500">
                    {role === 'BOTH' ? 'Buyer & Seller' : role === 'SELLER' ? 'As Seller' : 'As Buyer'}
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                      chainStatus === 'CONFIRMED'
                        ? 'bg-success-100 text-success-700'
                        : 'bg-warning-50 text-warning-700'
                    )}
                  >
                    {chainStatus === 'CONFIRMED' ? 'Confirmed' : 'Sending'}
                  </span>
                </div>
                <InvoiceCard
                  invoice={invoice}
                  role={role}
                  statusConfig={statusConfig}
                  isLoading={isLoading}
                  isProcessing={isProcessing}
                  isSyncing={isSyncingInvoice}
                  onPay={(inv) => {
                    if (!guardActionByChainStatus(chainStatus, 'pay')) return;
                    handlePay(inv);
                  }}
                  onCancel={(inv) => {
                    if (!guardActionByChainStatus(chainStatus, 'cancel')) return;
                    handleCancel(inv);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
