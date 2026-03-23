'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Invoice, AleoField, AleoAddress } from '@/lib/types';

interface DisputeFormProps {
  invoice: Invoice;
  onSubmit: (params: {
    reasonHash: AleoField;
    evidenceHash: AleoField;
    arbiter?: AleoAddress;
    resolutionDeadlineDays: number;
  }) => Promise<void>;
  onCancel: () => void;
}

export default function DisputeForm({ invoice, onSubmit, onCancel }: DisputeFormProps) {
  const t = useTranslations();
  const [reason, setReason] = useState('');
  const [arbiter, setArbiter] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(14);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const encoder = new TextEncoder();
      const reasonBytes = encoder.encode(reason);
      const reasonDigest = await crypto.subtle.digest('SHA-256', reasonBytes);
      const reasonHex = Array.from(new Uint8Array(reasonDigest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const reasonHash = `${BigInt('0x' + reasonHex.slice(0, 16))}field` as AleoField;

      await onSubmit({
        reasonHash,
        evidenceHash: '0field' as AleoField,
        arbiter: arbiter ? (arbiter as AleoAddress) : undefined,
        resolutionDeadlineDays: deadlineDays,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm text-amber-800">
          {t('dispute.confirmRaise')}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">{t('dispute.reason')}</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={t('dispute.reasonPlaceholder')}
          rows={3}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          {t('dispute.arbiter')}
        </label>
        <input
          type="text"
          value={arbiter}
          onChange={e => setArbiter(e.target.value)}
          placeholder={t('dispute.arbiterPlaceholder')}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          {t('dispute.deadline')}
        </label>
        <select
          value={deadlineDays}
          onChange={e => setDeadlineDays(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value={7}>{t('dispute.deadlineDays', { days: 7 })}</option>
          <option value={14}>{t('dispute.deadlineDays', { days: 14 })}</option>
          <option value={30}>{t('dispute.deadlineDays', { days: 30 })}</option>
          <option value={60}>{t('dispute.deadlineDays', { days: 60 })}</option>
        </select>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !reason.trim()}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isSubmitting ? t('dispute.submitting') : t('dispute.raiseDispute')}
        </button>
      </div>
    </form>
  );
}
