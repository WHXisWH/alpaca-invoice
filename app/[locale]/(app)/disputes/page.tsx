'use client';

import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { DisputeStatus } from '@/lib/types';
import { useTranslations } from 'next-intl';

export default function DisputesPage() {
  const t = useTranslations();
  const { disputes } = useDisputeStore();

  const statusLabels: Record<number, { text: string; className: string }> = {
    [DisputeStatus.OPEN]: { text: t('dispute.statusOpen'), className: 'bg-amber-100 text-amber-700' },
    [DisputeStatus.RESOLVED_CANCEL]: { text: t('dispute.statusResolvedCancel'), className: 'bg-red-100 text-red-700' },
    [DisputeStatus.RESOLVED_PAY]: { text: t('dispute.statusResolvedPay'), className: 'bg-emerald-100 text-emerald-700' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('dispute.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('dispute.pageDescription')}</p>
        </div>
      </div>

      {disputes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <AlertTriangle className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-700">{t('dispute.emptyTitle')}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('dispute.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map(dispute => {
            const status = statusLabels[dispute.status] ?? statusLabels[0];
            return (
              <Link
                key={dispute.disputeId}
                href={`/disputes/${encodeURIComponent(dispute.disputeId)}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {t('dispute.invoiceLabel')} {dispute.invoiceId.slice(0, 12)}...
                    </p>
                    <p className="text-xs text-slate-500">
                      {t('dispute.raisedAt')} {dispute.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                    {status.text}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
