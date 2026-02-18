'use client';

import { useState } from 'react';
import type {
  VerifyEnvelopePhasesResult,
  VerifyPhaseResult,
  ValidateAuditPackageResult
} from '@/services/AuditService/IAuditService';
import { Check, X, ChevronDown, ChevronRight, FileJson, Key } from 'lucide-react';

function PhaseCard({
  title,
  phase,
  defaultExpanded = true
}: {
  title: string;
  phase: VerifyPhaseResult;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        phase.ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {phase.ok ? (
            <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <X className="h-5 w-5 shrink-0 text-red-600" />
          )}
          <span className="font-semibold text-slate-900">{title}</span>
          <span className="text-sm text-slate-600">{phase.message}</span>
        </div>
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-slate-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-slate-500" />
        )}
      </button>
      {expanded && phase.checks && phase.checks.length > 0 && (
        <div className="border-t border-slate-200/80 bg-white/60 px-4 py-3">
          <div className="space-y-2">
            {phase.checks.map((c) => (
              <div
                key={c.key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  c.ok ? 'bg-emerald-100/80 text-emerald-800' : 'bg-red-100/80 text-red-800'
                }`}
              >
                {c.ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                <span className="font-medium">{c.key}:</span>
                <span>{c.detail ?? (c.ok ? 'ok' : 'failed')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface AuditVerifyFlowProps {
  envelopeText: string;
  setEnvelopeText: (value: string) => void;
  auditKey: string;
  setAuditKey: (value: string) => void;
  result: VerifyEnvelopePhasesResult | null;
  previewResult: ValidateAuditPackageResult | null;
  loading: boolean;
  error: string | null;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreview: (e?: React.FormEvent) => void;
  onVerify: (e: React.FormEvent) => void;
  onExportReport: () => void;
}

export default function AuditVerifyFlow({
  envelopeText,
  setEnvelopeText,
  auditKey,
  setAuditKey,
  result,
  previewResult,
  loading,
  error,
  onFileUpload,
  onPreview,
  onVerify,
  onExportReport
}: AuditVerifyFlowProps) {
  return (
    <div className="space-y-6">
      <form onSubmit={onVerify} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FileJson className="h-4 w-4" />
              Audit package JSON
            </label>
            <div className="flex gap-2">
              <input
                type="file"
                accept=".json,application/json"
                onChange={onFileUpload}
                className="block w-full max-w-xs cursor-pointer rounded-lg border border-slate-200 text-sm file:mr-2 file:rounded-l file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </div>
            <textarea
              value={envelopeText}
              onChange={(e) => setEnvelopeText(e.target.value)}
              placeholder="Paste or upload audit package JSON (envelope format)..."
              rows={8}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Key className="h-4 w-4" />
              Audit Key
            </label>
            <p className="text-xs text-slate-500">
              The 64-character hex key provided by the invoice owner (separately from the package).
            </p>
            <input
              type="text"
              value={auditKey}
              onChange={(e) => setAuditKey(e.target.value)}
              placeholder="Paste audit key (64 hex chars)..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onPreview()}
            disabled={loading || !envelopeText.trim() || !auditKey.trim()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? '...' : 'Preview disclosed content'}
          </button>
          <button
            type="submit"
            disabled={loading || !envelopeText.trim() || !auditKey.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? 'Verifying...' : 'Full verification'}
          </button>
        </div>
      </form>

      {previewResult !== null && (
        <div className="space-y-4">
          <div
            className={`flex items-center rounded-xl border px-4 py-3 ${
              previewResult.valid ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {previewResult.valid ? (
                <Check className="h-6 w-6 text-emerald-600" />
              ) : (
                <X className="h-6 w-6 text-red-600" />
              )}
              <span className="font-semibold text-slate-900">
                {previewResult.valid ? 'Disclosed content decrypted' : previewResult.reason ?? 'Decryption failed'}
              </span>
            </div>
          </div>
          {previewResult.valid && previewResult.decrypted?.data && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Disclosed content (preview only)</h3>
              <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {JSON.stringify(previewResult.decrypted.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              result.overallValid ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {result.overallValid ? (
                <Check className="h-6 w-6 text-emerald-600" />
              ) : (
                <X className="h-6 w-6 text-red-600" />
              )}
              <span className="font-semibold text-slate-900">
                {result.overallValid ? 'Audit package valid' : 'Audit package invalid'}
              </span>
            </div>
            {result.overallValid && (
              <button
                type="button"
                onClick={onExportReport}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Export report
              </button>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Verification phases</h3>
            <PhaseCard title="Phase 1: Package integrity (Pre-check)" phase={result.phase1} />
            <PhaseCard title="Phase 2: On-chain access control" phase={result.phase2} />
            <PhaseCard title="Phase 3: Chain anchoring" phase={result.phase3} />
            <PhaseCard title="Phase 4: Trustless verification" phase={result.phase4} />
          </div>

          {result.decrypted && result.overallValid && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Decrypted data (disclosed fields)</h3>
              <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                {JSON.stringify(result.decrypted.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
