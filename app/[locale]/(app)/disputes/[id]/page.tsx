'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useDisputeController } from '@/controller/Dispute/useDisputeController';
import { useDisputeEscrowChainSync } from '@/controller/Dispute/useDisputeEscrowChainSync';
import { useTranslations } from 'next-intl';
import DisputeTimeline from '@/components/dispute-timeline';
import { ArrowLeft, Scale, FileText, Lock, Shield, Gavel, AlertTriangle, CheckCircle, XCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { DisputeStatus, InvoiceStatus, EscrowStatus } from '@/lib/types';
import type { AleoField, Invoice, EscrowRecord } from '@/lib/types';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

function truncateAddr(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

const invoiceStatusConfig: Record<number, { label: string; icon: React.ReactNode; color: string }> = {
  [InvoiceStatus.PENDING]: { label: 'Pending', icon: <FileText className="h-3.5 w-3.5" />, color: 'text-slate-600 bg-slate-100' },
  [InvoiceStatus.PAID]: { label: 'Paid', icon: <CheckCircle className="h-3.5 w-3.5" />, color: 'text-emerald-700 bg-emerald-100' },
  [InvoiceStatus.CANCELLED]: { label: 'Cancelled', icon: <XCircle className="h-3.5 w-3.5" />, color: 'text-red-700 bg-red-100' },
  [InvoiceStatus.ESCROWED]: { label: 'Escrowed', icon: <Lock className="h-3.5 w-3.5" />, color: 'text-blue-700 bg-blue-100' },
  [InvoiceStatus.DISPUTED]: { label: 'Disputed', icon: <AlertTriangle className="h-3.5 w-3.5" />, color: 'text-amber-700 bg-amber-100' },
  [InvoiceStatus.REFUNDED]: { label: 'Refunded', icon: <RefreshCw className="h-3.5 w-3.5" />, color: 'text-amber-700 bg-amber-100' },
  [InvoiceStatus.RESOLVED_CANCELLED]: { label: 'Resolved (Cancel)', icon: <XCircle className="h-3.5 w-3.5" />, color: 'text-red-700 bg-red-100' },
  [InvoiceStatus.RESOLVED_PAID]: { label: 'Resolved (Pay)', icon: <CheckCircle className="h-3.5 w-3.5" />, color: 'text-emerald-700 bg-emerald-100' },
};

interface FlowStep {
  label: string;
  description?: string;
  date?: Date;
  status: 'completed' | 'active' | 'pending' | 'skipped';
  icon: React.ReactNode;
}

function buildFlowSteps(invoice: Invoice | undefined, escrow: EscrowRecord | undefined, dispute: { status: DisputeStatus; createdAt: Date; resolutionDeadline: Date }, t: ReturnType<typeof useTranslations>): FlowStep[] {
  const steps: FlowStep[] = [];

  steps.push({
    label: t('dispute.flowInvoiceCreated'),
    date: invoice?.createdAt,
    status: 'completed',
    icon: <FileText className="h-4 w-4" />,
    description: invoice ? `${(Number(invoice.amount) / 1_000_000).toLocaleString()} Credits` : undefined,
  });

  const escrowDone = !!escrow;
  steps.push({
    label: t('dispute.flowEscrowPaid'),
    date: escrow?.deliveryDeadline ? undefined : undefined,
    status: escrowDone ? 'completed' : 'pending',
    icon: <Lock className="h-4 w-4" />,
    description: escrow ? `${(Number(escrow.amount) / 1_000_000).toLocaleString()} Credits locked` : undefined,
  });

  steps.push({
    label: t('dispute.flowDisputeRaised'),
    date: dispute.createdAt,
    status: 'completed',
    icon: <AlertTriangle className="h-4 w-4" />,
  });

  const isResolved = dispute.status !== DisputeStatus.OPEN;
  steps.push({
    label: t('dispute.flowArbiterReview'),
    status: isResolved ? 'completed' : 'active',
    icon: <Gavel className="h-4 w-4" />,
    description: isResolved
      ? (dispute.status === DisputeStatus.RESOLVED_PAY ? t('dispute.upheldPaid') : t('dispute.dismissedCancelled'))
      : `${t('dispute.deadlineLabel')}: ${dispute.resolutionDeadline.toLocaleDateString()}`,
  });

  if (isResolved) {
    steps.push({
      label: dispute.status === DisputeStatus.RESOLVED_PAY ? t('dispute.flowFundsReleased') : t('dispute.flowFundsRefunded'),
      status: 'completed',
      icon: dispute.status === DisputeStatus.RESOLVED_PAY ? <CheckCircle className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />,
    });
  } else {
    steps.push({
      label: t('dispute.flowResolutionPending'),
      status: 'pending',
      icon: <Scale className="h-4 w-4" />,
    });
  }

  return steps;
}

export default function DisputeDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const disputeId = decodeURIComponent(params.id as string) as AleoField;
  const { disputes } = useDisputeStore();
  const { invoices } = useInvoiceStore();
  const { escrows } = useEscrowStore();
  const publicKey = useUserStore((s) => s.publicKey);
  const controller = useDisputeController();
  const { syncFromChain, isSyncing } = useDisputeEscrowChainSync();
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (publicKey) syncFromChain();
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispute = disputes.find((d) => d.disputeId === disputeId);

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

  const relatedInvoice = invoices.find((inv) => inv.id === dispute.invoiceId);
  const relatedEscrow = escrows.find((e) => e.invoiceId === dispute.invoiceId);
  const isArbiter = publicKey === dispute.arbiter;
  const isDisputant = publicKey === dispute.disputant;
  const isOpen = dispute.status === DisputeStatus.OPEN;

  const flowSteps = buildFlowSteps(relatedInvoice, relatedEscrow, dispute, t);

  const handleResolve = async (resolution: DisputeStatus.RESOLVED_CANCEL | DisputeStatus.RESOLVED_PAY) => {
    if (!relatedInvoice) {
      setError(t('dispute.errorInvoiceNotFound'));
      return;
    }
    if (!isArbiter) {
      setError(t('dispute.errorNotArbiter'));
      return;
    }
    setResolving(true);
    setError('');
    try {
      await controller.executeResolveDispute({ dispute, invoice: relatedInvoice, resolution });
      router.push('/disputes');
    } catch (err) {
      console.error('Resolve dispute failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/disputes')}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('dispute.backToDisputes')}
      </button>

      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('dispute.detail')}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {t('dispute.invoiceLabel')} {dispute.invoiceId.slice(0, 20)}…
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Role badge */}
            {isArbiter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                <Gavel className="h-3 w-3" />
                {t('dispute.roleArbiter')}
              </span>
            )}
            {isDisputant && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                <AlertTriangle className="h-3 w-3" />
                {t('dispute.roleDisputant')}
              </span>
            )}
            {/* Status badge */}
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                isOpen
                  ? 'bg-amber-100 text-amber-700'
                  : dispute.status === DisputeStatus.RESOLVED_PAY
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              )}
            >
              {isOpen ? t('dispute.statusOpen') : dispute.status === DisputeStatus.RESOLVED_PAY ? t('dispute.resolvedPay') : t('dispute.resolvedCancelStatus')}
            </span>
          </div>
        </div>

        {/* Participants grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-500">{t('dispute.disputant')}</p>
            <p className="mt-0.5 break-all text-sm text-slate-800">
              {truncateAddr(dispute.disputant)}
              {isDisputant && <span className="ml-1.5 text-xs text-blue-600">({t('dispute.you')})</span>}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{t('dispute.arbiterLabel')}</p>
            <p className="mt-0.5 break-all text-sm text-slate-800">
              {truncateAddr(dispute.arbiter)}
              {isArbiter && <span className="ml-1.5 text-xs text-purple-600">({t('dispute.you')})</span>}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{t('dispute.createdAt')}</p>
            <p className="mt-0.5 text-sm text-slate-800">{format(dispute.createdAt, 'yyyy-MM-dd HH:mm')}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{t('dispute.resolutionDeadline')}</p>
            <p className="mt-0.5 text-sm text-slate-800">{format(dispute.resolutionDeadline, 'yyyy-MM-dd HH:mm')}</p>
          </div>
        </div>
      </div>

      {/* Related Invoice & Escrow info */}
      {(relatedInvoice || relatedEscrow) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">{t('dispute.relatedInfo')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {relatedInvoice && (
              <>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t('dispute.invoiceAmount')}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-800">
                    {(Number(relatedInvoice.amount) / 1_000_000).toLocaleString()} Credits
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t('dispute.invoiceStatus')}</p>
                  <span className={cn(
                    'mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                    invoiceStatusConfig[relatedInvoice.status]?.color ?? 'text-slate-600 bg-slate-100'
                  )}>
                    {invoiceStatusConfig[relatedInvoice.status]?.icon}
                    {invoiceStatusConfig[relatedInvoice.status]?.label ?? `Status ${relatedInvoice.status}`}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t('invoice.detail.seller')}</p>
                  <p className="mt-0.5 text-sm text-slate-800 break-all">{truncateAddr(relatedInvoice.seller)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t('invoice.detail.buyer')}</p>
                  <p className="mt-0.5 text-sm text-slate-800 break-all">{truncateAddr(relatedInvoice.buyer)}</p>
                </div>
              </>
            )}
            {relatedEscrow && (
              <>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t('dispute.escrowAmount')}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-800">
                    {(Number(relatedEscrow.amount) / 1_000_000).toLocaleString()} Credits (locked)
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t('escrow.deliveryDeadline')}</p>
                  <p className="mt-0.5 text-sm text-slate-800">{format(relatedEscrow.deliveryDeadline, 'yyyy-MM-dd')}</p>
                </div>
              </>
            )}
          </div>
          {relatedInvoice && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={() => router.push(`/invoices/${relatedInvoice.invoiceHash}`)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                {t('dispute.viewInvoice')}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Flow / lifecycle steps */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{t('dispute.flowTitle')}</h2>
        <div className="space-y-0">
          {flowSteps.map((step, idx) => (
            <div key={idx} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    step.status === 'completed' ? 'bg-emerald-100 text-emerald-600' :
                    step.status === 'active' ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300' :
                    'bg-slate-100 text-slate-400'
                  )}
                >
                  {step.icon}
                </div>
                {idx < flowSteps.length - 1 && (
                  <div className={cn('h-8 w-0.5', step.status === 'completed' ? 'bg-emerald-200' : 'bg-slate-200')} />
                )}
              </div>
              <div className="pb-6">
                <p className={cn('text-sm font-medium', step.status === 'active' ? 'text-blue-800' : 'text-slate-800')}>
                  {step.label}
                </p>
                {step.date && (
                  <p className="text-xs text-slate-500">
                    {format(step.date, 'yyyy-MM-dd HH:mm')}
                  </p>
                )}
                {step.description && (
                  <p className="mt-0.5 text-xs text-slate-600">{step.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dispute Timeline (original events) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{t('dispute.timeline')}</h2>
        <DisputeTimeline dispute={dispute} />
      </div>

      {/* Resolve actions — only for arbiter */}
      {isOpen && isArbiter && (
        <div className="rounded-2xl border-2 border-purple-200 bg-purple-50/50 p-6 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-purple-900">
            <Scale className="h-5 w-5" />
            {t('dispute.resolve')}
          </h2>
          <p className="mb-4 text-sm text-purple-700">
            {t('dispute.resolveArbiterDesc')}
          </p>
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              disabled={resolving}
              onClick={() => handleResolve(DisputeStatus.RESOLVED_CANCEL)}
              className="flex-1 rounded-lg border border-red-300 bg-red-50 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {t('dispute.dismissCancel')}
            </button>
            <button
              disabled={resolving}
              onClick={() => handleResolve(DisputeStatus.RESOLVED_PAY)}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {t('dispute.upholdPay')}
            </button>
          </div>
        </div>
      )}

      {/* Non-arbiter notice */}
      {isOpen && !isArbiter && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <Shield className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600">{t('dispute.waitingForArbiter')}</p>
          <p className="text-xs text-slate-500 mt-1">
            {t('dispute.arbiterLabel')}: {truncateAddr(dispute.arbiter)}
          </p>
        </div>
      )}
    </div>
  );
}
