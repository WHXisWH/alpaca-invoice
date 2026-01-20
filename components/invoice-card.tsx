'use client';

import type { Invoice, AleoField } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface StatusConfig {
  label: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}

interface InvoiceCardProps {
  invoice: Invoice;
  role?: 'SELLER' | 'BUYER' | 'BOTH';
  statusConfig: StatusConfig;
  showFullAddresses?: boolean;
  isLoading?: boolean;
  isProcessing?: boolean;
  isSyncing?: boolean;
  onPay?: (invoice: Invoice) => void;
  onCancel?: (invoice: Invoice) => void;
}

export default function InvoiceCard({ 
  invoice, 
  role,
  statusConfig,
  showFullAddresses = false,
  isLoading = false,
  isProcessing = false,
  isSyncing = false,
  onPay,
  onCancel
}: InvoiceCardProps) {

  return (
    <TooltipProvider>
      <div className="rounded-xl border-2 border-amber-200 bg-white p-5 hover:border-amber-400 transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">Invoice ID</div>
            <Tooltip>
              <TooltipTrigger asChild>
                <code className="text-sm font-mono font-semibold text-slate-900">
                  {invoice.id.slice(0, 30)}...
                </code>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono text-xs">{invoice.id}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        <span
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border-2 ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
        >
          <span>{statusConfig.icon}</span>
          <span>{statusConfig.label}</span>
        </span>
      </div>

      {/* ✅ 添加：显示处理状态 */}
      {(isProcessing || isSyncing) && (
        <div className="mb-4 pb-4 border-b border-amber-100">
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>
              {isProcessing ? 'Processing transaction...' : 'Syncing chain records...'}
            </span>
          </div>
        </div>
      )}

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
          <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900">
            {showFullAddresses ? invoice.buyer : `${invoice.buyer.slice(0, 8)}...${invoice.buyer.slice(-6)}`}
          </code>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Seller</span>
          <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900">
            {showFullAddresses ? invoice.seller : `${invoice.seller.slice(0, 8)}...${invoice.seller.slice(-6)}`}
          </code>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Due Date</span>
          <span className="font-medium text-slate-900">
            {format(invoice.dueDate, 'yyyy-MM-dd')}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-4 border-t border-amber-100">
        {/* View Details button - always show */}
        <Link
          href={`/invoices/${invoice.invoiceHash}`}
          className="flex-1 text-center rounded-lg border-2 border-amber-200 px-3 py-2 text-sm font-semibold text-slate-900 hover:border-amber-400 transition-colors"
        >
          View Details
        </Link>

        {/* Action buttons - only show for PENDING invoices */}
        {invoice.status === InvoiceStatus.PENDING && role && (
          <>
            {role === 'BUYER' && onPay && (
              <button
                onClick={() => onPay(invoice)}
                disabled={isLoading || isProcessing || isSyncing}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Processing...' : '💳 Pay'}
              </button>
            )}
            {role === 'SELLER' && onCancel && (
              <button
                onClick={() => onCancel(invoice)}
                disabled={isLoading || isProcessing || isSyncing}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Cancelling...' : '❌ Cancel'}
              </button>
            )}
            {role === 'BOTH' && (
              <>
                {onPay && (
                  <button
                    onClick={() => onPay(invoice)}
                    disabled={isLoading || isProcessing || isSyncing}
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isProcessing ? 'Processing...' : '💳 Pay'}
                  </button>
                )}
                {onCancel && (
                  <button
                    onClick={() => onCancel(invoice)}
                    disabled={isLoading || isProcessing || isSyncing}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isProcessing ? 'Cancelling...' : '❌ Cancel'}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}
