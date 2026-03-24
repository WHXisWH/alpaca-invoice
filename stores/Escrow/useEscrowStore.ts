import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EscrowState } from './EscrowState';
import type { EscrowRecord, AleoField } from '@/lib/types';

export const useEscrowStore = create<EscrowState>()(
  persist(
    (set, get) => ({
      escrows: [],
      currentEscrow: null,
      isLoading: false,

      addEscrow(escrow: EscrowRecord) {
        set(state => {
          const exists = state.escrows.some(e => e.escrowId === escrow.escrowId);
          if (exists) return state;
          return { escrows: [...state.escrows, escrow] };
        });
      },

      updateEscrow(escrowId: AleoField, data: Partial<EscrowRecord>) {
        set(state => ({
          escrows: state.escrows.map(e =>
            e.escrowId === escrowId ? { ...e, ...data } : e
          ),
          currentEscrow:
            state.currentEscrow?.escrowId === escrowId
              ? { ...state.currentEscrow, ...data }
              : state.currentEscrow,
        }));
      },

      setCurrentEscrow(escrow: EscrowRecord | null) {
        set({ currentEscrow: escrow });
      },

      getEscrowByInvoiceId(invoiceId: AleoField): EscrowRecord | undefined {
        return get().escrows.find(e => e.invoiceId === invoiceId);
      },
    }),
    {
      name: 'alpaca-escrow-store',
      partialize: (state) => ({ escrows: state.escrows }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          if (parsed?.state?.escrows) {
            parsed.state.escrows = parsed.state.escrows.map((e: any) => ({
              ...e,
              deliveryDeadline: new Date(e.deliveryDeadline),
            }));
          }
          return parsed;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
