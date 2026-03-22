'use client';

import { Lock, CheckCircle, RefreshCw, Clock } from 'lucide-react';
import type { EscrowRecord, Invoice } from '@/lib/types';
import { EscrowStatus } from '@/lib/types';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface EscrowStatusCardProps {
  escrow: EscrowRecord;
  invoice: Invoice;
  onConfirmDelivery: () => Promise<void>;
  onClaimRefund: () => Promise<void>;
  isCurrentUserPayer: boolean;
}

function useCountdown(deadline: Date) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = deadline.getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('');
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      setRemaining(`${days}d ${hours}h ${minutes}m`);
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [deadline]);

  return remaining;
}

export default function EscrowStatusCard({
  escrow,
  invoice,
  onConfirmDelivery,
  onClaimRefund,
  isCurrentUserPayer,
}: EscrowStatusCardProps) {
  const t = useTranslations();
  const remaining = useCountdown(escrow.deliveryDeadline);
  const isExpired = new Date() > escrow.deliveryDeadline;
  const [processing, setProcessing] = useState(false);

  const statusConfig = {
    [EscrowStatus.LOCKED]: {
      label: t('escrow.statusLocked'),
      color: 'border-blue-300 bg-blue-50',
      icon: <Lock className="h-5 w-5 text-blue-600" />,
    },
    [EscrowStatus.RELEASED]: {
      label: t('escrow.statusReleased'),
      color: 'border-emerald-300 bg-emerald-50',
      icon: <CheckCircle className="h-5 w-5 text-emerald-600" />,
    },
    [EscrowStatus.REFUNDED]: {
      label: t('escrow.statusRefunded'),
      color: 'border-amber-300 bg-amber-50',
      icon: <RefreshCw className="h-5 w-5 text-amber-600" />,
    },
  };

  const config = statusConfig[escrow.status] ?? statusConfig[EscrowStatus.LOCKED];

  const handleConfirm = async () => {
    setProcessing(true);
    try { await onConfirmDelivery(); } finally { setProcessing(false); }
  };

  const handleRefund = async () => {
    setProcessing(true);
    try { await onClaimRefund(); } finally { setProcessing(false); }
  };

  return (
    <div className={`rounded-xl border-2 ${config.color} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {config.icon}
          <span className="font-semibold text-slate-800">{t('escrow.enabled')}: {config.label}</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <Clock className="h-4 w-4" />
          <span>{remaining || t('invoice.status.expired')}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-slate-500">{t('invoice.detail.amount')}</span>
          <p className="font-medium text-slate-800">{(Number(escrow.amount) / 1_000_000).toLocaleString()} {t('invoice.card.credits')}</p>
        </div>
        <div>
          <span className="text-slate-500">{t('escrow.deliveryDeadline')}</span>
          <p className="font-medium text-slate-800">{escrow.deliveryDeadline.toLocaleDateString()}</p>
        </div>
      </div>

      {escrow.status === EscrowStatus.LOCKED && isCurrentUserPayer && (
        <div className="space-y-2 pt-1">
          {!isExpired && (
            <>
              <p className="text-xs text-slate-600">
                {t('escrow.confirmDeliveryMsg')}
              </p>
              <button
                onClick={handleConfirm}
                disabled={processing}
                className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {processing ? t('invoice.card.processing') : t('invoice.detail.confirmDelivery')}
              </button>
            </>
          )}

          {isExpired && (
            <>
              <p className="text-xs text-amber-700">
                {t('escrow.refundAvailable')}
              </p>
              <button
                onClick={handleRefund}
                disabled={processing}
                className="w-full rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {processing ? t('invoice.card.processing') : t('invoice.detail.claimRefund')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
