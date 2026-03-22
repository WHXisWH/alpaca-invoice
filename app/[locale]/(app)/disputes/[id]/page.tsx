'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useDisputeController } from '@/controller/Dispute/useDisputeController';
import { useTranslations } from 'next-intl';
import DisputeTimeline from '@/components/dispute-timeline';
import { ArrowLeft, Scale } from 'lucide-react';
import { DisputeStatus } from '@/lib/types';
import type { AleoField } from '@/lib/types';
import { useState } from 'react';

export default function DisputeDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const disputeId = decodeURIComponent(params.id as string) as AleoField;
  const { disputes } = useDisputeStore();
  const { invoices } = useInvoiceStore();
  const controller = useDisputeController();
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  const dispute = disputes.find(d => d.disputeId === disputeId);

  if (!dispute) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-slate-500">{t('dispute.notFound')}</p>
        <button
          onClick={() => router.push('/disputes')}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          {t('dispute.backToDisputes')}
        </button>
      </div>
    );
  }

  const relatedInvoice = invoices.find(inv => inv.id === dispute.invoiceId);

  const handleResolve = async (resolution: DisputeStatus.RESOLVED_CANCEL | DisputeStatus.RESOLVED_PAY) => {
    if (!relatedInvoice) {
      setError('Cannot resolve: the related invoice was not found locally. Ensure invoices are synced.');
      return;
    }
    setResolving(true);
    setError('');
    try {
      await controller.executeResolveDispute({
        dispute,
        invoice: relatedInvoice,
        resolution,
      });
      router.push('/disputes');
    } catch (err) {
      console.error('Resolve dispute failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setResolving(false);
    }
  };

  const isOpen = dispute.status === DisputeStatus.OPEN;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/disputes')}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('dispute.backToDisputes')}
      </button>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('dispute.detail')}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {t('dispute.invoiceLabel')} {dispute.invoiceId.slice(0, 20)}...
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              isOpen
                ? 'bg-amber-100 text-amber-700'
                : dispute.status === DisputeStatus.RESOLVED_PAY
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {isOpen ? t('dispute.statusOpen') : dispute.status === DisputeStatus.RESOLVED_PAY ? t('dispute.resolvedPay') : t('dispute.resolvedCancelStatus')}
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-500">{t('dispute.disputant')}</p>
            <p className="mt-0.5 break-all text-sm text-slate-800">{dispute.disputant}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{t('dispute.arbiterLabel')}</p>
            <p className="mt-0.5 break-all text-sm text-slate-800">{dispute.arbiter}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{t('dispute.createdAt')}</p>
            <p className="mt-0.5 text-sm text-slate-800">{dispute.createdAt.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{t('dispute.resolutionDeadline')}</p>
            <p className="mt-0.5 text-sm text-slate-800">{dispute.resolutionDeadline.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{t('dispute.timeline')}</h2>
        <DisputeTimeline dispute={dispute} />
      </div>

      {isOpen && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
            <Scale className="h-5 w-5" />
            {t('dispute.resolve')}
          </h2>
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              disabled={resolving}
              onClick={() => handleResolve(DisputeStatus.RESOLVED_CANCEL)}
              className="flex-1 rounded-lg border border-red-300 bg-red-50 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {t('dispute.dismissCancel')}
            </button>
            <button
              disabled={resolving}
              onClick={() => handleResolve(DisputeStatus.RESOLVED_PAY)}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {t('dispute.upholdPay')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
