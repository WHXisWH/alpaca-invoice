'use client';

import type { Invoice } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { format } from 'date-fns';
import Link from 'next/link';
import { toast } from 'sonner';
import { useInvoiceStore } from '@/stores/invoiceStore';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function getStatusConfig(status: InvoiceStatus) {
  switch (status) {
    case InvoiceStatus.PENDING:
      return {
        label: 'Pending',
        icon: '⏳',
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-300'
      };
    case InvoiceStatus.PAID:
      return {
        label: 'Paid',
        icon: '✅',
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-300'
      };
    case InvoiceStatus.CANCELLED:
      return {
        label: 'Cancelled',
        icon: '❌',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
    case InvoiceStatus.EXPIRED:
      return {
        label: 'Expired',
        icon: '⚠️',
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-300'
      };
    default:
      return {
        label: 'Unknown',
        icon: '❓',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
  }
}

interface InvoiceCardProps {
  invoice: Invoice;
  showFullAddresses?: boolean;
}

export default function InvoiceCard({ invoice, showFullAddresses = false }: InvoiceCardProps) {
  const { payInvoice, cancelInvoice, isLoading } = useInvoiceStore();
  const statusConfig = getStatusConfig(invoice.status);

  const handlePay = async () => {
    try {
      toast.loading('Processing payment...', { id: 'pay-invoice' });
      const result = await payInvoice(invoice.id);
      toast.success('Payment successful!', {
        id: 'pay-invoice',
        description: `Transaction ID: ${result.transactionId.slice(0, 16)}...`
      });
    } catch (error) {
      toast.error('Payment failed', {
        id: 'pay-invoice',
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

  const handleCancel = async () => {
    try {
      toast.loading('Cancelling invoice...', { id: 'cancel-invoice' });
      await cancelInvoice(invoice.id);
      toast.success('Invoice cancelled successfully', { id: 'cancel-invoice' });
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: 'cancel-invoice',
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

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

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          href={`/invoices/${invoice.id}`}
          className="flex-1 text-center rounded-lg border-2 border-amber-200 px-3 py-2 text-sm font-semibold text-slate-900 hover:border-amber-400 transition-colors"
        >
          View Details
        </Link>

        {invoice.status === InvoiceStatus.PENDING && (
          <>
            <button
              onClick={handlePay}
              disabled={isLoading}
              className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Pay
            </button>
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="rounded-lg border-2 border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}
