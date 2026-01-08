'use client';

import AuditKeyGenerator from '@/components/audit-key-generator';

export default function AuditPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Audit Center</h2>
      <p className="text-sm text-slate-600">
        Generate Audit Keys and scope which invoices can be viewed plus expiration.
      </p>
      <AuditKeyGenerator />
    </div>
  );
}
