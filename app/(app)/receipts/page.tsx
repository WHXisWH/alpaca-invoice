'use client';

import Image from 'next/image';
import ReceiptViewer from '@/components/receipt-viewer';
import { Receipt } from 'lucide-react';

export default function ReceiptsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-100">
              <Receipt className="h-5 w-5 text-success-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-primary-900">Receipts</h1>
              <p className="text-sm text-primary-500">
                View payment receipts and transaction history
              </p>
            </div>
          </div>
        </div>
        <div className="relative hidden h-20 w-20 md:block">
          <Image
            src="/images/mascot/mascot-happy.png"
            alt="Receipts"
            fill
            className="object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm md:p-8">
        <ReceiptViewer />
      </div>
    </div>
  );
}
