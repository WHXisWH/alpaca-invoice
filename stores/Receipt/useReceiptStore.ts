import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AleoAddress, AleoField, AleoTransactionId, Microcredits } from '@/lib/types';

/**
 * Receipt item aligned with PaymentReceipt (SPEC 1.5).
 * 存储 PaymentRecord 时需同时包含 payment_id 和 settlement_anchor，供审计员 Step 2 从本地收据读取锚点。
 */
export type ReceiptItem = {
  /** Chain PaymentRecord.payment_id — 供审计包 buyer 路径使用 */
  paymentId: AleoField;
  /** Chain PaymentRecord.settlement_anchor（tx_id_hash 公开锚点）— 审计员 Step 2 资产核对起点 */
  settlementAnchor?: AleoField;
  invoiceId: AleoField;
  payer: AleoAddress;
  payee: AleoAddress;
  amount: Microcredits;
  paidAt: Date;
  /** 链上 tx_id（Money Flow 审计） */
  txId?: AleoTransactionId;
};

function reviveReceipts(list: any[]): ReceiptItem[] {
  return list.map((r) => ({
    ...r,
    paidAt: r?.paidAt instanceof Date ? r.paidAt : new Date(r?.paidAt),
    amount: typeof r?.amount === 'bigint' ? r.amount : BigInt(r?.amount ?? 0)
  }));
}

type ReceiptState = {
  receipts: ReceiptItem[];
  addReceipt: (r: ReceiptItem) => void;
  /** Wave 3: 按 invoiceId 更新 receipt 字段（如 settlementAnchor，轮询到 PaymentRecord 后写入） */
  updateReceipt: (invoiceId: AleoField, patch: Partial<Pick<ReceiptItem, 'settlementAnchor' | 'txId'>>) => void;
  clear: () => void;
  exportCsv: () => string;
};

function normalizeField(f: string): string {
  return String(f).replace(/field\.(private|public)$/i, 'field').trim();
}

export const useReceiptStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      receipts: [],
      addReceipt: (r) =>
        set((state) => ({
          receipts: [r, ...state.receipts].slice(0, 200) // keep recent
        })),
      updateReceipt: (invoiceId, patch) =>
        set((state) => ({
          receipts: state.receipts.map((r) =>
            normalizeField(r.invoiceId) === normalizeField(invoiceId) ? { ...r, ...patch } : r
          )
        })),
      clear: () => set({ receipts: [] }),
      exportCsv: () => {
        const rows = [
          ['paymentId', 'settlementAnchor', 'invoiceId', 'payer', 'payee', 'amount_microcredits', 'paidAt', 'txId'].join(',')
        ];
        for (const r of get().receipts) {
          rows.push(
            [
              r.paymentId,
              r.settlementAnchor ?? '',
              r.invoiceId,
              r.payer,
              r.payee,
              r.amount.toString(),
              r.paidAt.toISOString(),
              r.txId ?? ''
            ].join(',')
          );
        }
        return rows.join('\n');
      }
    }),
    {
      name: 'receipt-store',
      deserialize: (str) => {
        const data = JSON.parse(str);
        if (data?.state?.receipts) {
          data.state.receipts = reviveReceipts(data.state.receipts);
        }
        return data;
      }
    }
  )
);
