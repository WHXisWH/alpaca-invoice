'use client';

import { useState } from 'react';
import { auditService } from '@/services/auditService';
import type { AleoField } from '@/lib/types';

export default function AuditKeyGenerator() {
  const [invoiceIds, setInvoiceIds] = useState('');
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [auditor, setAuditor] = useState('');
  const [message, setMessage] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    const ids = invoiceIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as AleoField[];
    const key = await auditService.generate(
      {
        invoiceIds: ids,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS'],
        expiresAt: new Date(expiresAt).getTime(),
        auditorAddress: auditor as any
      },
      'view_key_placeholder'
    );
    setMessage(`Audit Key: ${key.key} (expires ${new Date(key.config.expiresAt).toLocaleDateString()})`);
  };

  return (
    <form
      onSubmit={handleGenerate}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="text-sm font-semibold text-slate-900">Generate Audit Key</div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Invoice IDs (comma separated)</label>
        <input
          type="text"
          value={invoiceIds}
          onChange={(e) => setInvoiceIds(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          placeholder="invoiceId1field, invoiceId2field"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Auditor address</label>
        <input
          type="text"
          value={auditor}
          onChange={(e) => setAuditor(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          placeholder="aleo1..."
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Expiration date</label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Generate
      </button>
      {message && <p className="text-sm text-emerald-600">{message}</p>}
    </form>
  );
}
