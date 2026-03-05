'use client';

import type { ReceiptItem } from '@/stores/Receipt/useReceiptStore';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Copy, ExternalLink } from 'lucide-react';

interface ReceiptCardProps {
  receipt: ReceiptItem;
  explorerTxUrl?: string | null;
}

export default function ReceiptCard({ receipt, explorerTxUrl = null }: ReceiptCardProps) {
  const truncateAddress = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  return (
    <TooltipProvider>
      <div className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_46px_-24px_rgba(15,23,42,0.35)]">
        {/* Left status bar — paid */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-success-500" />

        <div className="p-5 pl-6">
          {/* Header: Payment ID */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="mb-1 text-xs font-medium text-primary-500">Payment ID</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm font-semibold text-primary-900">
                      {String(receipt.paymentId).slice(0, 16)}...
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(String(receipt.paymentId))}
                      className="cursor-pointer text-primary-400 hover:text-primary-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-mono text-xs">{String(receipt.paymentId)}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success-100/80 px-2.5 py-1 text-xs font-semibold text-success-700 ring-1 ring-white/60">
              Paid
            </span>
          </div>

          {/* Amount */}
          <div className="mb-4">
            <p className="mb-1 text-xs font-medium text-primary-500">Amount</p>
            <p className="text-2xl font-bold text-primary-900">
              {(Number(receipt.amount) / 1_000_000).toFixed(2)}
              <span className="ml-1.5 text-sm font-normal text-primary-500">credits</span>
            </p>
          </div>

          {/* Details grid */}
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="mb-0.5 text-xs text-primary-500">Payer</p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
                  {truncateAddress(receipt.payer)}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(receipt.payer)}
                  className="shrink-0 cursor-pointer rounded p-1 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                  title="Copy payer address"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-primary-500">Payee</p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
                  {truncateAddress(receipt.payee)}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(receipt.payee)}
                  className="shrink-0 cursor-pointer rounded p-1 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                  title="Copy payee address"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-primary-500">Paid at</p>
              <p className="font-medium text-primary-800">
                {format(receipt.paidAt, 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-primary-500">Invoice ID</p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
                  {String(receipt.invoiceId).slice(0, 12)}...
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(String(receipt.invoiceId))}
                  className="shrink-0 cursor-pointer rounded p-1 text-primary-400 hover:bg-primary-100 hover:text-primary-600"
                  title="Copy invoice ID"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {explorerTxUrl && (
            <div className="flex gap-2 border-t border-primary-100/70 pt-4">
              <a
                href={explorerTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-white"
                title="View transaction on explorer"
              >
                <ExternalLink className="h-4 w-4" />
                Explorer
              </a>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
