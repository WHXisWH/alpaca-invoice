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
    }
  )
);
