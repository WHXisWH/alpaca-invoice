'use client';

import { Shield, TrendingUp, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { CreditMetrics } from '@/lib/types';

interface CreditDashboardCardProps {
  metrics: CreditMetrics | null;
  onCollect: () => Promise<void>;
  isLoading: boolean;
}

export default function CreditDashboardCard({ metrics, onCollect, isLoading }: CreditDashboardCardProps) {
  const t = useTranslations();

  if (!metrics) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-800">{t('credit.dashboardCard')}</h3>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          {t('credit.dashboardDescription')}
        </p>
        <button
          onClick={onCollect}
          disabled={isLoading}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          {isLoading ? t('common.loading') : t('credit.collectButton')}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const scoreColor = metrics.onTimeRate >= 90 ? 'text-emerald-600' : metrics.onTimeRate >= 70 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-800">{t('credit.dashboardCard')}</h3>
        </div>
        <Link
          href="/settings"
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
        >
          {t('credit.generate')}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        <span className={`text-3xl font-bold ${scoreColor}`}>
          {metrics.onTimeRate.toFixed(0)}%
        </span>
        <span className="text-sm text-slate-500">{t('credit.onTime')}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1 text-slate-600">
          <TrendingUp className="h-3 w-3" />
          {metrics.totalInvoices} {t('credit.invoicesCount')}
        </div>
        <div className="text-slate-600">
          {metrics.paidOnTime} {t('credit.onTimeCount')}
        </div>
      </div>
    </div>
  );
}
