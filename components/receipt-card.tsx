'use client';

import { cn } from '@/lib/utils';
import { Receipt } from 'lucide-react';

interface ReceiptCardProps {
  variant: 'buyer' | 'seller';
  payee?: string;
  payer?: string;
  amount: string;
  status: string;
  documentId: string;
  className?: string;
}

export function ReceiptCard({
  variant,
  payee,
  payer,
  amount,
  status,
  documentId,
  className,
}: ReceiptCardProps) {
  const isBuyer = variant === 'buyer';
  const label = isBuyer ? 'Payment Receipt (As Buyer/Payer)' : 'Payment Receipt (As Seller/Payee)';
  const truncate = (addr: string) => `${addr.slice(0, 10)}...${addr.slice(-8)}`;

  return (
    <div
      className={cn(
        'rounded-2xl border border-primary-200/60 bg-white/80 p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur',
        className
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100">
          <Receipt className="h-5 w-5 text-accent-600" />
        </div>
        <div>
          <p className="text-xs font-medium text-primary-500">{label}</p>
          <p className="text-sm font-semibold text-primary-900">
            {isBuyer ? 'Your proof of payment' : 'Your accounting voucher'}
          </p>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        {isBuyer && payee && (
          <div className="flex justify-between">
            <span className="text-primary-500">Payee</span>
            <code className="rounded bg-primary-50 px-2 py-0.5 font-mono text-xs text-primary-700">
              {truncate(payee)}
            </code>
          </div>
        )}
        {!isBuyer && payer && (
          <div className="flex justify-between">
            <span className="text-primary-500">Payer</span>
            <code className="rounded bg-primary-50 px-2 py-0.5 font-mono text-xs text-primary-700">
              {truncate(payer)}
            </code>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-primary-500">Amount</span>
          <span className="font-semibold text-primary-900">{amount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-primary-500">Status</span>
          <span className="font-medium text-success-600">{status}</span>
        </div>
        <div className="flex justify-between border-t border-primary-100 pt-3">
          <span className="text-primary-500">Document ID</span>
          <code className="font-mono text-xs text-primary-700">{documentId}</code>
        </div>
      </div>
    </div>
  );
}
