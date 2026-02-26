'use client';

import type { LineItemV3 } from '@/lib/types';
import { format } from 'date-fns';

export interface JctPdfPreviewSummary {
  net10: number;
  tax10: number;
  net8: number;
  tax8: number;
  total: number;
}

export interface JctPdfPreviewProps {
  sellerName: string;
  sellerTNumber: string;
  buyerName: string;
  issueDate: Date;
  lineItems: LineItemV3[];
  summary: JctPdfPreviewSummary;
}

/**
 * JCT PDF 预览组件（NTA 六要素合规）
 * - 发行者标识（T+13）、交易日期、内容明细（※）、税率分类汇总、确切税额、受票者标识
 * - 8% 商品行名称自动追加 ※
 * - 底部分类汇总表与法定免责声明脚注
 */
export default function JctPdfPreview({
  sellerName,
  sellerTNumber,
  buyerName,
  issueDate,
  lineItems,
  summary
}: JctPdfPreviewProps) {
  const displaySeller = sellerName.trim() || '—';
  const displayT = sellerTNumber.replace(/\D/g, '').slice(0, 13);
  const displayBuyer = buyerName.trim() || '—';
  const dateStr = format(issueDate, 'yyyy年MM月dd日');

  return (
    <div
      className="rounded-xl border-2 border-amber-200 bg-white shadow-sm print:shadow-none"
      style={{ minHeight: 420 }}
    >
      <div className="border-b border-amber-200 bg-amber-50/50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
        JCT 適合請求書（プレビュー）
      </div>

      <div className="p-4 space-y-4 text-sm text-slate-800">
        {/* 1. 发行者标识：卖方名称 + 登録番号 T+13 */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-slate-900">発行者</span>
          <span>{displaySeller}</span>
          {displayT.length === 13 && (
            <span className="text-slate-600">
              登録番号 T{displayT}
            </span>
          )}
        </div>

        {/* 2. 交易日期 */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-slate-900">取引日</span>
          <span>{dateStr}</span>
        </div>

        {/* 3. 内容明细：8% 行追加 ※ */}
        <div>
          <div className="font-medium text-slate-900 mb-2">明細</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-left">
                <th className="px-2 py-1.5 font-semibold">品目</th>
                <th className="px-2 py-1.5 font-semibold w-16 text-right">数量</th>
                <th className="px-2 py-1.5 font-semibold w-20 text-right">単価(税込)</th>
                <th className="px-2 py-1.5 font-semibold w-16 text-right">税率</th>
                <th className="px-2 py-1.5 font-semibold w-24 text-right">金額(税抜)</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-slate-400 text-center">
                    商品行を追加してください
                  </td>
                </tr>
              ) : (
                lineItems.map((item, i) => {
                  const isReduced = item.taxRate === 8;
                  const desc = (item.description || '—').trim();
                  const displayDesc = isReduced ? `※ ${desc}` : desc;
                  const net = item.amount ?? 0;
                  const rateLabel = item.taxRate === 10 ? '10%' : item.taxRate === 8 ? '8%' : '0%';
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1.5">{displayDesc}</td>
                      <td className="px-2 py-1.5 text-right">{item.quantity}</td>
                      <td className="px-2 py-1.5 text-right">{item.unitPrice.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right">{rateLabel}</td>
                      <td className="px-2 py-1.5 text-right">{net.toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4 & 5. 税率分类汇总 + 确切税额 */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="font-medium text-slate-700">10% 対象（税抜）</div>
            <div className="text-right">{summary.net10.toLocaleString()} 円</div>
            <div className="font-medium text-slate-700">10% 消費税</div>
            <div className="text-right">{summary.tax10.toLocaleString()} 円</div>
            <div className="font-medium text-slate-700">8% 対象（税抜）※軽減</div>
            <div className="text-right">{summary.net8.toLocaleString()} 円</div>
            <div className="font-medium text-slate-700">8% 消費税 ※軽減税率</div>
            <div className="text-right">{summary.tax8.toLocaleString()} 円</div>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <span>合計（税込）</span>
            <span>{summary.total.toLocaleString()} 円</span>
          </div>
        </div>

        {/* 6. 受票者标识 */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-slate-900">宛先</span>
          <span>{displayBuyer}</span>
        </div>

        {/* 法定免责声明脚注 */}
        <p className="text-[10px] text-slate-500 border-t border-slate-100 pt-3 mt-3">
          本請求書は適格請求書等に該当します。※は軽減税率対象品目を示します。取引内容に疑義がある場合は発行者にご確認ください。
        </p>
      </div>
    </div>
  );
}
