'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, CheckCircle, XCircle, Shield } from 'lucide-react';
import type { CreditVerifyResult } from '@/lib/types';

interface CreditProofVerifierProps {
  onVerify: (proofId: string) => Promise<CreditVerifyResult>;
  isProcessing: boolean;
}

export default function CreditProofVerifier({
  onVerify,
  isProcessing,
}: CreditProofVerifierProps) {
  const t = useTranslations();
  const [proofId, setProofId] = useState('');
  const [result, setResult] = useState<CreditVerifyResult | null>(null);

  const handleVerify = async () => {
    if (!proofId.trim()) return;
    const res = await onVerify(proofId.trim());
    setResult(res);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={proofId}
          onChange={e => setProofId(e.target.value)}
          placeholder={t('credit.verifyInput')}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleVerify}
          disabled={isProcessing || !proofId.trim()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          {isProcessing ? t('credit.verifying') : t('credit.verifyButton')}
        </button>
      </div>

      {result && (
        <div
          className={`rounded-xl border-2 p-4 ${
            result.isValid
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-center gap-2">
            {result.isValid ? (
              <>
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <span className="font-semibold text-emerald-800">{t('credit.validProof')}</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="font-semibold text-red-800">{t('credit.invalidProof')}</span>
              </>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {result.isValid
              ? t('credit.valid')
              : result.error ?? t('credit.invalid')}
          </p>
        </div>
      )}
    </div>
  );
}
