'use client';

import { useState } from 'react';
import type { Invoice } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { format } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { CreditCard, X, Eye, Copy, Loader2, ExternalLink, ChevronDown, Package } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StatusConfig } from '@/controller/Invoice/IInvoices';

interface InvoiceCardProps {
  invoice: Invoice;
  role?: 'SELLER' | 'BUYER' | 'BOTH';
  statusConfig?: StatusConfig;
  showFullAddresses?: boolean;
  isLoading?: boolean;
  isProcessing?: boolean;
  isSyncing?: boolean;
  explorerTxUrl?: string | null;
  onPay?: (invoice: Invoice) => void;
  onCancel?: (invoice: Invoice) => void;
}

const statusBarColors = {
  [InvoiceStatus.PENDING]: 'bg-warning-400',
  [InvoiceStatus.PAID]: 'bg-success-500',
  [InvoiceStatus.CANCELLED]: 'bg-primary-400',
  [InvoiceStatus.EXPIRED]: 'bg-error-500',
};

export default function InvoiceCard({
  invoice,
  role,
  statusConfig: _statusConfig,
  showFullAddresses = false,
  isLoading = false,
  isProcessing = false,
  isSyncing = false,
  explorerTxUrl = null,
  onPay,
  onCancel,
}: InvoiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const details = invoice.details;
  const truncateAddress = (addr: string) =>
    showFullAddresses ? addr : `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  return (
    <TooltipProvider>
      <div className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_46px_-24px_rgba(15,23,42,0.35)]">
          {/* Left Status Bar */}
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 w-1',
              statusBarColors[invoice.status]
            )}
          />

          <div className="p-5 pl-6">
            {/* Header: ID + Status */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="mb-1 text-xs font-medium text-primary-500">Invoice ID</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm font-semibold text-primary-900">
                        {invoice.id.slice(0, 16)}...
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(invoice.id)}
                        className="cursor-pointer text-primary-400 hover:text-primary-600"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">{invoice.id}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <StatusBadge status={invoice.status} />
            </div>

            {(isProcessing || isSyncing) && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary-50/70 px-3 py-2 text-xs text-primary-700 ring-1 ring-primary-200/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{isProcessing ? 'Processing transaction...' : 'Syncing chain records...'}</span>
              </div>
            )}

            {/* Amount */}
            <div className="mb-4">
              <p className="mb-1 text-xs font-medium text-primary-500">Amount</p>
              <p className="text-2xl font-bold text-primary-900">
                {(Number(invoice.amount) / 1_000_000).toFixed(2)}
                <span className="ml-1.5 text-sm font-normal text-primary-500">
                  credits
                </span>
              </p>
            </div>

            {/* Details Grid */}
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="mb-0.5 text-xs text-primary-500">Buyer</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <code className="block truncate rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
                      {truncateAddress(invoice.buyer)}
                    </code>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">{invoice.buyer}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div>
                <p className="mb-0.5 text-xs text-primary-500">Due Date</p>
                <p className="font-medium text-primary-800">
                  {format(invoice.dueDate, 'MMM dd, yyyy')}
                </p>
              </div>
            </div>

            {/* Details summary row — only when details exist */}
            {details && (
              <div className="mb-4 flex items-center justify-between rounded-lg bg-accent-50/60 px-3 py-2 ring-1 ring-accent-200/30">
                <div className="flex items-center gap-2 text-xs text-accent-700">
                  <Package className="h-3.5 w-3.5" />
                  <span className="font-medium">{details.invoiceNumber}</span>
                  <span className="text-accent-500">·</span>
                  <span>{details.lineItems.length} item{details.lineItems.length !== 1 ? 's' : ''}</span>
                  {details.currency && (
                    <>
                      <span className="text-accent-500">·</span>
                      <span>{details.currency}</span>
                    </>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  className="flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-600 transition-colors hover:text-accent-800"
                >
                  {expanded ? 'Hide' : 'Details'}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 border-t border-primary-100/70 pt-4">
              <Link
                href={`/invoices/${invoice.invoiceHash}`}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-white"
              >
                <Eye className="h-4 w-4" />
                View
              </Link>
              {explorerTxUrl && (
                <a
                  href={explorerTxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-white"
                  title="View transaction on Aleo Explorer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Explorer
                </a>
              )}

              {invoice.status === InvoiceStatus.PENDING && role && (
                <>
                  {(role === 'BUYER' || role === 'BOTH') && onPay && (
                    <button
                      onClick={() => onPay(invoice)}
                      disabled={isLoading || isProcessing || isSyncing}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-success-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-success-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4" />
                          Pay
                        </>
                      )}
                    </button>
                  )}
                  {(role === 'SELLER' || role === 'BOTH') && onCancel && (
                    <button
                      onClick={() => onCancel(invoice)}
                      disabled={isLoading || isProcessing || isSyncing}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-error-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4" />
                          Cancel
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Expandable line items — inside the card, below actions */}
          {details && expanded && (
            <div className="border-t border-primary-100/60">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-primary-100/60 bg-primary-50/50">
                    <th className="px-4 py-2 font-medium text-primary-500">Item</th>
                    <th className="px-3 py-2 text-right font-medium text-primary-500">Qty</th>
                    <th className="px-3 py-2 text-right font-medium text-primary-500">Price</th>
                    <th className="px-4 py-2 text-right font-medium text-primary-500">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {details.lineItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-primary-50/80 last:border-0">
                      <td className="px-4 py-2 text-primary-800">{item.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary-700">{item.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary-700">{item.unitPrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-primary-900">{item.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-primary-100/60 bg-primary-50/30">
                    <td colSpan={3} className="px-3 py-2 text-right text-primary-500">Subtotal</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-primary-800">{details.subtotal.toFixed(2)}</td>
                  </tr>
                  {details.taxAmount > 0 && (
                    <tr className="bg-primary-50/30">
                      <td colSpan={3} className="px-3 py-2 text-right text-primary-500">Tax</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-primary-800">{details.taxAmount.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="bg-primary-50/30">
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold text-primary-700">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-primary-900">{details.total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
    </TooltipProvider>
  );
}
