'use client';

import ReceiptViewer from '@/components/receipt-viewer';

export default function ReceiptsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Receipts</h2>
      <ReceiptViewer />
    </div>
  );
}
