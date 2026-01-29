'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useInvoices } from '@/controller/Invoice/useInvoices';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import InvoiceCard from '@/components/invoice-card';
import { EmptyState } from '@/components/ui/empty-state';
import { MotionContainer, MotionItem } from '@/components/ui/motion';
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

  // Only allow actions after on-chain confirmation
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
        <MotionContainer>
          <MotionItem className="surface-card p-8 text-center">
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
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100/80 ring-1 ring-accent-200/40">
            <Shield className="h-6 w-6 text-accent-600" />
          </div>
          <h3 className="text-lg font-semibold text-primary-900">Unlock Private Data</h3>
          <p className="mt-2 text-sm text-primary-500">
            Signature required to decrypt invoice data
          </p>
          <button
            onClick={handleUnlock}
            disabled={isLoading}
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
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
          </MotionItem>
        </MotionContainer>
      </div>
    );
  }

  // Loading state
  if (showLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <MotionContainer>
          <MotionItem className="text-center">
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
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100/80 ring-1 ring-primary-200/40">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
          <p className="text-sm text-primary-500">Loading invoices...</p>
          </MotionItem>
        </MotionContainer>
      </div>
    );
  }

  // Wallet connection prompt
  if (showWalletPrompt) {
    return (
      <MotionContainer>
        <MotionItem className="surface-card p-8">
          <EmptyState
            icon={Wallet}
            title="Connect Wallet"
            description="Connect your Aleo wallet to view and manage invoices"
          />
        </MotionItem>
      </MotionContainer>
    );
  }

  if (!showMainContent) {
    return null;
  }

  return (
    <MotionContainer className="space-y-6">
      {/* Actions */}
      <MotionItem className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/invoices/create"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent-600"
        >
          <FilePlus className="h-4 w-4" />
          Create Invoice
        </Link>
        <button
          onClick={handleSyncAll}
          disabled={isSyncing || isLoading}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary-200/60 bg-white/70 px-4 py-2.5 text-sm font-medium text-primary-700 shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          title="Sync status from chain"
        >
          <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
          {isSyncing ? 'Syncing...' : 'Sync'}
        </button>
      </MotionItem>

      {/* Filter tabs */}
      <MotionItem className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
              filter === tab.key
                ? 'bg-primary-900 text-white shadow-[0_12px_26px_-18px_rgba(15,23,42,0.5)]'
                : 'bg-primary-100/80 text-primary-700 hover:bg-primary-200/80'
            )}
          >
            {tab.label}
          </button>
        ))}
      </MotionItem>

      {/* Search */}
      <MotionItem>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, hash, or address..."
          className="w-full max-w-md rounded-lg border border-primary-200/60 bg-white/80 px-4 py-2.5 text-sm text-primary-900 placeholder:text-primary-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
        />
      </MotionItem>

      {/* Invoice list */}
      {filteredInvoices.length === 0 ? (
        <MotionItem className="surface-card p-8">
          <EmptyState
            icon={FileText}
            mascot="sleeping"
            title="No invoices found"
            description={search ? 'Try adjusting your search terms' : 'Create your first invoice to get started'}
            action={
              !search && (
                <Link
                  href="/invoices/create"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent-600"
                >
                  <FilePlus className="h-4 w-4" />
                  Create Invoice
                </Link>
              )
            }
          />
        </MotionItem>
      ) : (
        <MotionContainer className="grid gap-4 md:grid-cols-2" stagger={0.06}>
          {filteredInvoices.map(({ invoice, role, chainStatus, statusConfig }) => {
            const isProcessing = isInvoiceProcessing(invoice.id);
            // Unified architecture: determine directly from sendingInvoiceHashes (Single Source of Truth)
            const isSyncingInvoice = isInvoiceSyncing(invoice);

            return (
              <MotionItem key={invoice.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-primary-500">
                    {role === 'BOTH' ? 'Buyer & Seller' : role === 'SELLER' ? 'As Seller' : 'As Buyer'}
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-white/60',
                      chainStatus === 'CONFIRMED'
                        ? 'bg-success-100/80 text-success-700'
                        : 'bg-warning-50/80 text-warning-700'
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
              </MotionItem>
            );
          })}
        </MotionContainer>
      )}
    </MotionContainer>
  );
}
