'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useInvoiceInitialize } from '@/controller/Invoice/useInvoiceInitialize';
import { useInvoiceDetail } from '@/controller/Invoice/useInvoiceDetail';
import InvoiceCard from '@/components/invoice-card';
import { AleoField } from '@/lib/types';
import { InitializationStatus } from '@/stores/Invoice/InvoiceState';

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceHash = useMemo(
    () => (Array.isArray(params?.id) ? params.id[0] : (params?.id as string)) as AleoField | null,
    [params]
  );

  // 初始化加载（场景A）
  const { 
    initStatus, 
    handleUnlock, 
    isAuthRequired, 
    isLoading: isInitializing 
  } = useInvoiceInitialize();

  // 详情页对账逻辑（场景B & C）
  const { 
    invoice, 
    currentStatus, 
    isSyncing, 
    isConfirmed 
  } = useInvoiceDetail(invoiceHash);

  // 显示授权遮罩
  if (isAuthRequired) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="mb-4">
            <div className="text-lg font-semibold text-slate-900 mb-2">
              解锁隐私数据
            </div>
            <p className="text-sm text-slate-600 mb-4">
              需要授权访问您的私有发票数据
            </p>
            <button
              onClick={handleUnlock}
              className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              解锁
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 显示加载状态
  if (isInitializing || initStatus === InitializationStatus.LOADING_DB) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="text-sm text-slate-600">正在加载发票数据...</div>
        </div>
      </div>
    );
  }

  // 发票不存在
  if (!invoice) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        <p className="text-sm text-slate-600">Not found: {invoiceHash}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Invoice detail</h2>
        {/* 链上确认状态 */}
        <div className="flex items-center gap-2">
          {isSyncing && (
            <span className="text-xs text-amber-600 animate-pulse">
              正在同步链上记录...
            </span>
          )}
          {isConfirmed && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              ✓ 已确认 (Found on Chain)
            </span>
          )}
          {!isConfirmed && !isSyncing && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              ⏳ 发送中
            </span>
          )}
        </div>
      </div>

      <InvoiceCard invoice={invoice} showFullAddresses={true} />
      
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
