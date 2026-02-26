'use client';

import { Shield } from 'lucide-react';
import type { CurrencyFlag } from '@/lib/types';

export interface PaymentProgressProps {
  currencyFlag: CurrencyFlag;
  approvalStatus: 'idle' | 'checking' | 'insufficient' | 'approved';
  phase: 1 | 2 | 3 | null;
  confirmationDepth: number;
  isComplete: boolean;
}

/**
 * 三阶段支付进度条（PRD 4.2）
 * Phase 1: 权限获取（USDCx Approve）
 * Phase 2: Proving（隐私盾牌动效）
 * Phase 3: Finalizing（确认深度）
 */
export default function PaymentProgress({
  currencyFlag,
  approvalStatus,
  phase,
  confirmationDepth,
  isComplete
}: PaymentProgressProps) {
  const isUsdcx = currencyFlag === 1;
  const step1Active = phase === 1 || (isUsdcx && approvalStatus === 'insufficient' && !phase);
  const step2Active = phase === 2;
  const step3Active = phase === 3;

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4 space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isComplete ? 'bg-emerald-500' : step3Active ? 'bg-emerald-400' : 'bg-blue-500'
            }`}
            style={{
              width: isComplete ? '100%' : step3Active ? `${Math.min(66 + (confirmationDepth / 10), 100)}%` : step2Active ? '50%' : step1Active ? '16%' : '0%'
            }}
          />
        </div>
        <span className="text-xs font-medium text-slate-600">
          {isComplete ? 'Done' : phase === 3 ? `Confirmations: ${confirmationDepth}` : phase === 2 ? 'Proving' : phase === 1 ? 'Approval' : '…'}
        </span>
      </div>

      {/* Phase 1: USDCx approval (only when USDCx) */}
      {isUsdcx && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            step1Active ? 'border-amber-300 bg-amber-50' : approvalStatus === 'approved' ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <span className="font-medium text-slate-800">Phase 1 — 权限获取</span>
          <p className="mt-0.5 text-slate-600">
            {approvalStatus === 'checking' && '正在检查授权额度…'}
            {approvalStatus === 'insufficient' && '授权不足，请点击「Approve & Pay」'}
            {approvalStatus === 'approved' && '✓ 已授权'}
            {approvalStatus === 'idle' && '等待授权'}
          </p>
        </div>
      )}

      {/* Phase 2: Proving — 隐私盾牌动效 */}
      <div
        className={`rounded-lg border px-3 py-3 text-sm flex items-center gap-3 ${
          step2Active ? 'border-blue-300 bg-blue-100/80' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className={step2Active ? 'animate-spin' : ''}>
          <Shield className="h-8 w-8 text-blue-600" />
        </div>
        <div>
          <span className="font-medium text-slate-800">Phase 2 — 证明生成 (Proving)</span>
          <p className="mt-0.5 text-slate-600">
            正在本地生成零知识证明，请勿关闭浏览器
          </p>
        </div>
      </div>

      {/* Phase 3: Finalizing */}
      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          step3Active || isComplete ? 'border-emerald-300 bg-emerald-50/80' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <span className="font-medium text-slate-800">Phase 3 — 广播确认 (Finalizing)</span>
        <p className="mt-0.5 text-slate-600">
          {isComplete ? '✓ 交易已确认' : step3Active ? `链上确认中… (${confirmationDepth} confirmations)` : '等待链上确认'}
        </p>
      </div>
    </div>
  );
}
