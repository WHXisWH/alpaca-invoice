'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
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
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { InvoiceStatus } from '@/lib/types';

const tabs: Array<{ key: 'all' | 'pending' | 'paid' | 'cancelled'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' }
];

const roleTabs: Array<{ key: 'all' | 'sent' | 'received'; label: string }> = [
  { key: 'all', label: 'All roles' },
  { key: 'sent', label: 'Sent' },
  { key: 'received', label: 'Received' }
];

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading invoices...</div>}>
      <InvoicesPageInner />
    </Suspense>
  );
}

function InvoicesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthRequired, handleUnlock } = useAuthCheck();
  const {
    filteredInvoices,
    sentInvoices,
    receivedInvoices,
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
  const [roleFilter, setRoleFilter] = useState<'all' | 'sent' | 'received'>('all');

  useEffect(() => {
    const q = searchParams?.get('filter');
    if (q === 'sent' || q === 'received') setRoleFilter(q);
    else setRoleFilter('all');
  }, [searchParams]);

  const handleRoleChange = (role: 'all' | 'sent' | 'received') => {
    setRoleFilter(role);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (role === 'all') params.delete('filter');
    else params.set('filter', role);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const displayInvoices = useMemo(() => {
    if (roleFilter === 'sent') return sentInvoices;
    if (roleFilter === 'received') return receivedInvoices;
    return filteredInvoices;
  }, [roleFilter, sentInvoices, receivedInvoices, filteredInvoices]);

  const exportCsv = () => {
    if (!displayInvoices.length) return;
    const rows = [
      ['invoiceId', 'role', 'status', 'buyer', 'seller', 'amount_microcredits', 'dueDate', 'createdAt'].join(',')
    ];
    for (const item of displayInvoices) {
      const inv = item.invoice;
      rows.push(
        [
          inv.id,
          item.role,
          InvoiceStatus[inv.status] ?? inv.status,
          inv.buyer,
          inv.seller,
          inv.amount.toString(),
          inv.dueDate?.toISOString?.() ?? '',
          inv.createdAt?.toISOString?.() ?? ''
        ].join(',')
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invoices.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {roleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleRoleChange(tab.key)}
              className={cn(
                'px-3 py-2 text-sm font-semibold transition-colors',
                roleFilter === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
        <button
          onClick={exportCsv}
          disabled={!displayInvoices.length}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Export current list to CSV"
        >
          <Download className="h-4 w-4" />
          Export CSV
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
      {displayInvoices.length === 0 ? (
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
          {displayInvoices.map(({ invoice, role, chainStatus, statusConfig }) => {
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
