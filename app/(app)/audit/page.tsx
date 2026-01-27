'use client';

import Image from 'next/image';
import AuditKeyGenerator from '@/components/audit-key-generator';
import AuditValidator from '@/components/audit-validator';
import { ShieldCheck } from 'lucide-react';

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-100">
              <ShieldCheck className="h-5 w-5 text-info-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-primary-900">Audit Center</h1>
              <p className="text-sm text-primary-500">
                Generate audit keys for selective disclosure to auditors
              </p>
            </div>
          </div>
        </div>
        <div className="relative hidden h-20 w-20 md:block">
          <Image
            src="/images/mascot/mascot-shield.png"
            alt="Audit"
            fill
            className="object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AuditKeyGenerator />
        <AuditValidator />
      </div>
    </div>
  );
}
