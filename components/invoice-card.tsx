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
  onPay?: (invoice: Invoice) => void;
  onCancel?: (invoice: Invoice) => void;
}

export default function InvoiceCard({ 
  invoice, 
  role,
  statusConfig,
  showFullAddresses = false,
  isLoading = false,
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
                disabled={isLoading}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                💳 Pay
              </button>
            )}
            {role === 'SELLER' && onCancel && (
              <button
                onClick={() => onCancel(invoice)}
                disabled={isLoading}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ❌ Cancel
              </button>
            )}
            {role === 'BOTH' && (
              <>
                {onPay && (
                  <button
                    onClick={() => onPay(invoice)}
                    disabled={isLoading}
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    💳 Pay
                  </button>
                )}
                {onCancel && (
                  <button
                    onClick={() => onCancel(invoice)}
                    disabled={isLoading}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ❌ Cancel
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
