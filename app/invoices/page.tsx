'use client';

import Link from 'next/link';
import { useInvoices } from '@/controller/Invoice/useInvoices';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import InvoiceCard from '@/components/invoice-card';
import { toast } from 'sonner';

export default function InvoicesPage() {
  // ✅ 授权检查（独立调用，与详情页一致）
  const { isAuthRequired, handleUnlock } = useAuthCheck();

  // ✅ 列表页业务逻辑（处理三种情况的初始化）
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
    isInvoiceProcessing
  } = useInvoices();

  /**
   * ✅ 列表页操作对齐详情页逻辑：
   * - 仅在链上确认（CONFIRMED）后才允许 Pay / Cancel
   * - SENDING 状态时按钮禁用，并提示用户先等待/Sync
   */
  const guardActionByChainStatus = (
    chainStatus: 'SENDING' | 'CONFIRMED' | null | undefined,
    actionName: 'pay' | 'cancel'
  ) => {
    if (chainStatus !== 'CONFIRMED') {
      toast.warning('Not ready yet', {
        description:
          actionName === 'pay'
            ? 'This invoice is still sending. Please wait for chain confirmation (or click Sync All) before paying.'
            : 'This invoice is still sending. Please wait for chain confirmation (or click Sync All) before cancelling.'
      });
      return false;
    }
    return true;
  };

  const tabs = [
    { key: 'all' as const, label: 'All' },
    { key: 'pending' as const, label: 'Pending' },
    { key: 'paid' as const, label: 'Paid' },
    { key: 'cancelled' as const, label: 'Cancelled' }
  ];

  // ✅ 授权遮罩（与详情页一致）
  if (isAuthRequired) {
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

  // ✅ 加载状态（与详情页一致）
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

  // ✅ 钱包连接提示
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

  // ✅ 主内容
  if (!showMainContent) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Tabs */}
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

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice ID / hash / buyer / seller address"
          className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>

      {/* Results */}
      {filteredInvoices.length === 0 && (
        <p className="text-sm text-slate-500">No matching invoices.</p>
      )}

      {/* Invoice Cards */}
      <div className="grid gap-3 md:grid-cols-2">
        {filteredInvoices.map(({ invoice, role, chainStatus, statusConfig }, index) => {
          // ✅ 添加：检查每张发票的处理状态
          const isProcessing = isInvoiceProcessing(invoice.id);
          // ✅ 直接使用 chainStatus 判断是否在同步（更可靠，因为已通过 handleStatusUpdate 更新）
          const isSyncingInvoice = chainStatus === 'SENDING';
          
          return (
            <div key={`${invoice.invoiceHash}-${index}`} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {role === 'BOTH' ? 'Buyer & seller' : role === 'SELLER' ? 'Seller view' : 'Buyer view'}
                </span>
                {/* ✅ 显示链上确认状态（与详情页一致） */}
                {chainStatus === 'CONFIRMED' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                    ✓ Confirmed
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    ⏳ Sending
                  </span>
                )}
              </div>
              <InvoiceCard 
                invoice={invoice}
                role={role}
                statusConfig={statusConfig}
                isLoading={isLoading}
                // ✅ 添加：传递处理状态
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
    </div>
  );
}
