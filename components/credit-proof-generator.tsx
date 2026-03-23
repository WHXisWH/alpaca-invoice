'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Shield, TrendingUp, Clock, AlertTriangle, Award, BarChart3 } from 'lucide-react';
import { CreditClaimType } from '@/lib/types';
import type { CreditMetrics, CreditClaim, CreditProofToken } from '@/lib/types';

interface CreditProofGeneratorProps {
  metrics: CreditMetrics | null;
  onCollectMetrics: () => Promise<void>;
  onGenerateProof: (claim: CreditClaim) => Promise<CreditProofToken>;
  isProcessing: boolean;
}

export default function CreditProofGenerator({
  metrics,
  onCollectMetrics,
  onGenerateProof,
  isProcessing,
}: CreditProofGeneratorProps) {
  const t = useTranslations();

  const claimTypes = [
    { type: CreditClaimType.ON_TIME_RATE, label: t('credit.claimType.onTimeRate'), icon: Clock, unit: '%' },
    { type: CreditClaimType.VOLUME, label: t('credit.claimType.volume'), icon: BarChart3, unit: 'invoices' },
    { type: CreditClaimType.AMOUNT_RANGE, label: t('credit.claimType.amountRange'), icon: TrendingUp, unit: 'microcredits' },
    { type: CreditClaimType.ACCOUNT_AGE, label: t('credit.claimType.accountAge'), icon: Award, unit: 'days' },
    { type: CreditClaimType.DISPUTE_RATE, label: t('credit.claimType.disputeRate'), icon: AlertTriangle, unit: '%' },
  ];
  const [selectedType, setSelectedType] = useState<CreditClaimType>(CreditClaimType.ON_TIME_RATE);
  const [threshold, setThreshold] = useState(90);
  const [generatedProof, setGeneratedProof] = useState<CreditProofToken | null>(null);

  const handleGenerate = async () => {
    const claim: CreditClaim = {
      claimType: selectedType,
      threshold,
      periodStart: new Date(Date.now() - 365 * 86400 * 1000),
      periodEnd: new Date(),
    };
    const proof = await onGenerateProof(claim);
    setGeneratedProof(proof);
  };

  return (
    <div className="space-y-6">
      {!metrics ? (
        <div className="text-center py-8">
          <Shield className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-slate-700">{t('credit.collectTitle')}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('credit.collectDescription')}
          </p>
          <button
            onClick={onCollectMetrics}
            disabled={isProcessing}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? t('credit.collecting') : t('credit.collectButton')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-bold text-slate-800">{metrics.totalInvoices}</p>
              <p className="text-xs text-slate-500">{t('credit.metrics.totalInvoices')}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{metrics.onTimeRate.toFixed(1)}%</p>
              <p className="text-xs text-slate-500">{t('credit.metrics.onTimeRate')}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-bold text-slate-800">{metrics.paidOnTime}</p>
              <p className="text-xs text-slate-500">{t('credit.metrics.paidOnTime')}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">
                {(Number(metrics.totalPaidAmount) / 1_000_000).toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">{t('credit.totalPaidCredits')}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{metrics.disputeCount}</p>
              <p className="text-xs text-slate-500">{t('credit.disputes')}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{t('credit.selectClaimType')}</h3>
            <div className="space-y-2">
              {claimTypes.map(ct => {
                const Icon = ct.icon;
                return (
                  <button
                    key={ct.type}
                    onClick={() => setSelectedType(ct.type)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedType === ct.type
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {ct.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700">{t('credit.threshold')}</label>
              <input
                type="number"
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={isProcessing}
              className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isProcessing ? t('credit.generating') : t('credit.generateButton')}
            </button>
          </div>

          {generatedProof && (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-600" />
                <span className="font-semibold text-emerald-800">{t('credit.proofGenerated')}</span>
              </div>
              <div className="text-sm text-slate-600">
                <p><strong>{t('credit.proofIdLabel')}</strong> <code className="text-xs break-all">{generatedProof.proofId}</code></p>
                <p><strong>{t('credit.validLabel')}</strong> {generatedProof.isValid ? t('common.yes') : t('common.no')}</p>
                <p><strong>{t('credit.expiresLabel')}</strong> {generatedProof.expiresAt.toLocaleDateString()}</p>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {t('credit.shareProof')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
