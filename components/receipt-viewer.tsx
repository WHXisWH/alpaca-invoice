'use client';

import { Download, RefreshCw } from 'lucide-react';
import { useReceipts } from '@/controller/Receipt/useReceipts';

export default function ReceiptViewer() {
  const { receipts, isSyncing, handleSyncAllReceipts, exportCsv } = useReceipts();
  const hasData = receipts.length > 0;

  const handleExport = () => {
    const csv = exportCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receipts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Payment receipts</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncAllReceipts}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={!hasData}
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>
      {!hasData && <p className="text-sm text-slate-500">No receipts yet.</p>}
      <div className="space-y-3">
        {receipts.map((r) => (
          <div key={r.paymentId} className="rounded-lg border border-slate-100 p-3">
            <div className="text-xs text-slate-500">Payment ID: {r.paymentId}</div>
            <div className="text-sm text-slate-700">
              Amount: {(Number(r.amount) / 1_000_000).toFixed(2)} credits
            </div>
            <div className="text-xs text-slate-500">
              Buyer: {r.payer.slice(0, 12)}... → Seller: {r.payee.slice(0, 12)}...
            </div>
            <div className="text-xs text-slate-500">
              Invoice: {r.invoiceId}
            </div>
            <div className="text-xs text-slate-500">
              Paid at: {r.paidAt.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500">
              Tx: {r.txId}
            </div>
            {r.blockHeight != null && (
              <div className="text-xs text-slate-500">
                Block Height: {r.blockHeight}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
