'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useInvoiceDetail } from '@/controller/Invoice/useInvoiceDetail';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import { AleoField, InvoiceStatus } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceHash = useMemo(
    () => (Array.isArray(params?.id) ? params.id[0] : (params?.id as string)) as AleoField | null,
    [params]
  );

  // ✅ 授权检查（独立调用）
  const { isAuthRequired, handleUnlock } = useAuthCheck();

  // ✅ 详情页逻辑（统一轮询架构）
  // 自动轮询由全局 AutoPoller 管理，手动同步通过 handleSyncStatus 触发
  const { 
    invoice, 
    isLoadingInvoice,
    isSyncing, 
    isConfirmed,
    userRole,
    statusConfig,
    isProcessing,
    isSyncingStatus,
    handlePay,
    handleCancel,
    handleSyncStatus
  } = useInvoiceDetail(invoiceHash);

  // 显示授权遮罩
  if (isAuthRequired) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="mb-4">
            <div className="text-lg font-semibold text-slate-900 mb-2">
              Unlock Private Data
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Authorization required to access your private invoice data
            </p>
            <button
              onClick={handleUnlock}
              className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ 显示加载状态（从 IndexedDB 加载）
  if (isLoadingInvoice) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="text-sm text-slate-600">Loading invoice data...</div>
        </div>
      </div>
    );
  }

  // ✅ 发票不存在 - 显示更友好的提示（可能是正在上链）
  if (!invoice) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <p className="text-sm text-slate-600 mb-2">
            Invoice not found: {invoiceHash}
          </p>
          <p className="text-xs text-slate-500">
            This invoice may still be processing on the blockchain. Please wait a moment and refresh.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        {/* Chain confirmation status and sync button */}
        <div className="flex items-center gap-3">
          {isSyncing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600">
              <RefreshCw className={cn('h-3.5 w-3.5', 'animate-spin')} />
              Syncing chain records...
            </span>
          )}
          {isConfirmed && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              ✓ Confirmed (Found on Chain)
            </span>
          )}
          {!isConfirmed && !isSyncing && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              ⏳ Sending
            </span>
          )}
          {/* Manual sync button */}
          {isConfirmed && (
            <button
              onClick={handleSyncStatus}
              disabled={isSyncingStatus || isProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Sync latest status from chain"
            >
              <svg className={`w-3.5 h-3.5 ${isSyncingStatus ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isSyncingStatus ? 'Syncing...' : 'Sync Status'}
            </button>
          )}
        </div>
      </div>

      {/* 发票详情卡片 */}
      <div className="rounded-xl border-2 border-amber-200 bg-white p-5">
        {/* Header with Status */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">Invoice ID</div>
            <code className="text-sm font-mono font-semibold text-slate-900 break-all">
              {invoice.id}
            </code>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border-2 ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
          >
            <span>{statusConfig.icon}</span>
            <span>{statusConfig.label}</span>
          </span>
        </div>

        {/* Amount */}
        <div className="mb-4 pb-4 border-b border-amber-100">
          <div className="text-xs text-slate-500 mb-1">Amount</div>
          <div className="text-2xl font-bold text-slate-900">
            {(Number(invoice.amount) / 1_000_000).toFixed(2)}
            <span className="text-sm font-normal text-slate-600 ml-2">credits</span>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Buyer</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
              {invoice.buyer}
            </code>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Seller</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
              {invoice.seller}
            </code>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Due Date</span>
            <span className="font-medium text-slate-900">
              {format(invoice.dueDate, 'yyyy-MM-dd')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Created At</span>
            <span className="font-medium text-slate-900">
              {format(invoice.createdAt, 'yyyy-MM-dd HH:mm')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Your Role</span>
            <span className="font-medium text-slate-900 capitalize">
              {userRole === 'seller' ? '🏪 Seller' : userRole === 'buyer' ? '🛒 Buyer' : '❓ Unknown'}
            </span>
          </div>
        </div>

        {/* Action Buttons - Role-based */}
        {invoice.status === InvoiceStatus.PENDING && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-amber-100">
            {userRole === 'buyer' && (
              <button
                onClick={handlePay}
                disabled={isProcessing || !isConfirmed}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Processing...' : '💳 Pay Invoice'}
              </button>
            )}
            {userRole === 'seller' && (
              <button
                onClick={handleCancel}
                disabled={isProcessing || !isConfirmed}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Cancelling...' : '❌ Cancel Invoice'}
              </button>
            )}
            {userRole === 'unknown' && (
              <div className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 text-center">
                ⚠️ You are not the buyer or seller of this invoice
              </div>
            )}
          </div>
        )}
        
        {invoice.status !== InvoiceStatus.PENDING && (
          <div className="mt-4 pt-4 border-t border-amber-100">
            <div className="text-sm text-slate-600 text-center">
              {invoice.status === InvoiceStatus.PAID && '✅ This invoice has been paid'}
              {invoice.status === InvoiceStatus.CANCELLED && '❌ This invoice has been cancelled'}
              {invoice.status === InvoiceStatus.EXPIRED && '⚠️ This invoice has expired'}
            </div>
          </div>
        )}
      </div>
      
      {/* Line Items */}
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
    </div>
  );
}
