import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AleoAddress, AleoField, Microcredits } from '@/lib/types';

export type ReceiptItem = {
  paymentId: string;
  invoiceId: AleoField;
  payer: AleoAddress;
  payee: AleoAddress;
  amount: Microcredits;
  paidAt: Date;
  txId: string;
};

function reviveReceiptDates(list: any[]): ReceiptItem[] {
  return list.map((r) => ({
    ...r,
    paidAt: r?.paidAt instanceof Date ? r.paidAt : new Date(r?.paidAt)
  }));
}

type ReceiptState = {
  receipts: ReceiptItem[];
  addReceipt: (r: ReceiptItem) => void;
  clear: () => void;
  exportCsv: () => string;
};

export const useReceiptStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      receipts: [],
      addReceipt: (r) =>
        set((state) => ({
          receipts: [r, ...state.receipts].slice(0, 200) // keep recent
        })),
      clear: () => set({ receipts: [] }),
      exportCsv: () => {
        const rows = [
          ['paymentId', 'invoiceId', 'payer', 'payee', 'amount_microcredits', 'paidAt', 'txId'].join(',')
        ];
        for (const r of get().receipts) {
          rows.push(
            [
              r.paymentId,
              r.invoiceId,
              r.payer,
              r.payee,
              r.amount.toString(),
              r.paidAt.toISOString(),
              r.txId
            ].join(',')
          );
        }
        return rows.join('\n');
      }
    }),
    {
      name: 'receipt-store'
      ,
      deserialize: (str) => {
        const data = JSON.parse(str);
        if (data?.state?.receipts) {
          data.state.receipts = reviveReceiptDates(data.state.receipts);
        }
        return data;
      }
    }
  )
);
