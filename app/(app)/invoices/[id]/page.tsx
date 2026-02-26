'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { useInvoiceDetail } from '@/controller/Invoice/useInvoiceDetail';
import PaymentProgress from '@/components/payment-progress';
import { CurrencyFlag } from '@/lib/types';
import { useAuthCheck } from '@/controller/Auth/useAuthCheck';
import { AleoField, InvoiceStatus } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuditPackageGenerate } from '@/controller/Audit/useAuditPackageGenerate';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceHash = useMemo(
    () => (Array.isArray(params?.id) ? params.id[0] : (params?.id as string)) as AleoField | null,
    [params]
  );

  // Authorization check (independent call)
  const { isAuthRequired, handleUnlock } = useAuthCheck();

  // Detail page logic (unified polling architecture)
  // Automatic polling is managed by the global AutoPoller; manual sync is triggered via handleSyncStatus
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
  const { generate } = useAuditPackageGenerate();
  const protocolService = useMemo(() => new AleoProtocolService(), []);
  const [anchors, setAnchors] = useState<{
    commitment?: string | null;
    rules?: string | null;
    fieldCommitments?: any;
    auth?: any;
    counter?: number | null;
  }>({});
  const [isFetchingAnchors, setIsFetchingAnchors] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  const registry = useMemo(() => createInvoiceRegistryService(protocolService), [protocolService]);
  const safeStringify = useCallback(
    (obj: any) => JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
    []
  );

  useEffect(() => {
    const fetchAnchors = async () => {
      if (!invoice) return;
      setIsFetchingAnchors(true);
      try {
        const [commitment, fieldCommitments, rules, auth, counter] = await Promise.all([
          registry.getCommitmentRoot(invoice.id),
          registry.getFieldCommitments(invoice.id),
          registry.getRulesResult(invoice.id),
          registry.getAuditAuthorization(invoice.id),
          registry.getAuditCounter(invoice.seller)
        ]);
        setAnchors({ commitment, fieldCommitments, rules, auth, counter });
      } catch (e) {
        setAnchors({});
      } finally {
        setIsFetchingAnchors(false);
      }
    };
    fetchAnchors();
  }, [invoice, registry]);

  const handleDownloadPackage = async (mode: 'minimal' | 'full') => {
    if (!invoice) return;
    setDownloadMsg('');
    try {
      const fields =
        mode === 'minimal'
          ? ['amount', 'tax_amount', 'due_date', 'buyer', 'seller']
          : ['amount', 'tax_amount', 'due_date', 'buyer', 'seller', 'currency', 'items_hash', 'memo_hash', 'order_id'];
      const pkg = await generate({
        invoiceId: invoice.id,
        selectedFields: fields,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000
      });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-package-${mode}-${invoice.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadMsg(`Generated ${mode} package`);
    } catch (e: any) {
      setDownloadMsg(e?.message || 'Failed to generate package');
    }
  };

  // Display authorization overlay
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

  // Display loading state (loading from IndexedDB)
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

  // Invoice not found - display a user-friendly message (may still be processing on-chain)
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
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            title="Back to Invoices"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        </div>
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

      {/* Invoice detail card */}
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

        {/* Details — all 9 scope fields + metadata */}
        <div className="space-y-2 mb-4 text-sm">
          {/* buyer */}
          <div className="flex justify-between">
            <span className="text-slate-600">Buyer</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
              {invoice.buyer}
            </code>
          </div>
          {/* seller */}
          <div className="flex justify-between">
            <span className="text-slate-600">Seller</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
              {invoice.seller}
            </code>
          </div>
          {/* due_date */}
          <div className="flex justify-between">
            <span className="text-slate-600">Due Date</span>
            <span className="font-medium text-slate-900">
              {format(invoice.dueDate, 'yyyy-MM-dd')}
            </span>
          </div>
          {/* created_at */}
          <div className="flex justify-between">
            <span className="text-slate-600">Created At</span>
            <span className="font-medium text-slate-900">
              {format(invoice.createdAt, 'yyyy-MM-dd HH:mm')}
            </span>
          </div>
          {/* role */}
          <div className="flex justify-between">
            <span className="text-slate-600">Your Role</span>
            <span className="font-medium text-slate-900 capitalize">
              {userRole === 'seller' ? '🏪 Seller' : userRole === 'buyer' ? '🛒 Buyer' : '❓ Unknown'}
            </span>
          </div>
          {/* tax_amount */}
          <div className="flex justify-between">
            <span className="text-slate-600">Tax Amount</span>
            <span className="font-medium text-slate-900">
              {(Number(invoice.taxAmount ?? 0) / 1_000_000).toFixed(2)} credits
            </span>
          </div>
          {/* tax_rate (from details, if available) */}
          {invoice.details?.taxRate != null && (
            <div className="flex justify-between">
              <span className="text-slate-600">Tax Rate</span>
              <span className="font-medium text-slate-900">
                {(invoice.details.taxRate * 100).toFixed(2)}%
              </span>
            </div>
          )}
          {/* currency */}
          <div className="flex justify-between">
            <span className="text-slate-600">Currency</span>
            {invoice.details?.currency ? (
              <span className="font-medium text-slate-900">{invoice.details.currency}</span>
            ) : invoice.currency ? (
              <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
                {invoice.currency}
              </code>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          {/* order_id */}
          <div className="flex justify-between">
            <span className="text-slate-600">Order ID</span>
            {invoice.details?.orderId || invoice.details?.invoiceNumber ? (
              <span className="font-medium text-slate-900">
                {invoice.details.orderId ?? invoice.details.invoiceNumber}
              </span>
            ) : invoice.orderId ? (
              <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
                {invoice.orderId}
              </code>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          {/* memo_hash / notes */}
          <div className="flex justify-between">
            <span className="text-slate-600">Memo</span>
            {invoice.details?.notes ? (
              <span className="font-medium text-slate-900">{invoice.details.notes}</span>
            ) : invoice.memoHash ? (
              <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all">
                {invoice.memoHash}
              </code>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          {/* invoice_hash */}
          <div className="flex justify-between">
            <span className="text-slate-600">Invoice Hash</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900 break-all max-w-[60%] text-right">
              {invoice.invoiceHash}
            </code>
          </div>
        </div>

        {/* Audit anchors — only render when at least one anchor has data */}
        {!isFetchingAnchors && (anchors.commitment || anchors.rules || anchors.fieldCommitments || anchors.auth || anchors.counter != null) && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-slate-900">Audit anchors</div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 text-xs text-slate-800">
              {anchors.commitment && (
                <div>
                  <div className="text-slate-500">Commitment root</div>
                  <div className="font-mono break-all">{anchors.commitment}</div>
                </div>
              )}
              {anchors.rules && (
                <div>
                  <div className="text-slate-500">Rules result</div>
                  <div className="font-mono break-all">{anchors.rules}</div>
                </div>
              )}
              {anchors.fieldCommitments && (
                <div className="md:col-span-2">
                  <div className="text-slate-500">Field commitments</div>
                  <pre className="mt-1 max-h-28 overflow-auto rounded border border-slate-200 bg-white p-2">
                    {safeStringify(anchors.fieldCommitments)}
                  </pre>
                </div>
              )}
              {anchors.auth && (
                <div className="md:col-span-2">
                  <div className="text-slate-500">Audit authorization</div>
                  <pre className="mt-1 max-h-24 overflow-auto rounded border border-slate-200 bg-white p-2">
                    {safeStringify(anchors.auth)}
                  </pre>
                </div>
              )}
              {anchors.counter != null && (
                <div>
                  <div className="text-slate-500">Seller audit counter</div>
                  <div className="font-mono break-all">{anchors.counter}</div>
                </div>
              )}
            </div>
            {invoice.details ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => handleDownloadPackage('minimal')}
                  className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Download minimal package
                </button>
                <button
                  onClick={() => handleDownloadPackage('full')}
                  className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Download full package
                </button>
                {downloadMsg && <span className="text-xs text-slate-600">{downloadMsg}</span>}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">
                Audit package download requires locally stored invoice details.
              </p>
            )}
          </div>
        )}

        {/* Payment progress (Phase 1/2/3) when paying */}
        {invoice.status === InvoiceStatus.PENDING && userRole === 'buyer' && isProcessing && (
          <div className="mt-4">
            <PaymentProgress
              currencyFlag={invoice.currencyFlag ?? CurrencyFlag.CREDITS}
              approvalStatus="idle"
              phase={2}
              confirmationDepth={0}
              isComplete={false}
            />
          </div>
        )}

        {/* Action Buttons - Role-based */}
        {invoice.status === InvoiceStatus.PENDING && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-amber-100">
            {userRole === 'buyer' && (
              <button
                onClick={handlePay}
                disabled={isProcessing || !isConfirmed}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing
                  ? 'Processing...'
                  : (invoice.currencyFlag === CurrencyFlag.USDCX ? 'Approve & Pay' : '💳 Pay Invoice')}
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
      
      {/* Line Items & Summary */}
      {invoice.details && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Line Items</div>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {invoice.details.lineItems.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <span>{item.description}</span>
                <span>
                  {item.quantity} × {item.unitPrice} = {item.amount}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{invoice.details.subtotal} {invoice.details.currency}</span>
            </div>
            {invoice.details.taxRate > 0 && (
              <div className="flex justify-between">
                <span>Tax ({(invoice.details.taxRate * 100).toFixed(2)}%)</span>
                <span>{invoice.details.taxAmount} {invoice.details.currency}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Total</span>
              <span>{invoice.details.total} {invoice.details.currency}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
