'use client';

import InvoiceForm from '@/components/invoice-form';

export default function CreateInvoicePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Create invoice</h2>
        <p className="text-sm text-slate-600">
          Enter buyer address, amount, and details; encrypt locally and produce on-chain hash.
        </p>
      </div>
      <InvoiceForm />
    </div>
  );
}
