import { create } from 'zustand';
import type { DisputeState } from './DisputeState';
import type { DisputeRecord, AleoField } from '@/lib/types';

export const useDisputeStore = create<DisputeState>((set, get) => ({
  disputes: [],
  currentDispute: null,
  isLoading: false,

  addDispute(dispute: DisputeRecord) {
    set(state => {
      const exists = state.disputes.some(d => d.disputeId === dispute.disputeId);
      if (exists) return state;
      return { disputes: [...state.disputes, dispute] };
    });
  },

  updateDispute(disputeId: AleoField, data: Partial<DisputeRecord>) {
    set(state => ({
      disputes: state.disputes.map(d =>
        d.disputeId === disputeId ? { ...d, ...data } : d
      ),
      currentDispute:
        state.currentDispute?.disputeId === disputeId
          ? { ...state.currentDispute, ...data }
          : state.currentDispute,
    }));
  },

  setCurrentDispute(dispute: DisputeRecord | null) {
    set({ currentDispute: dispute });
  },

  removeDispute(disputeId: AleoField) {
    set(state => ({
      disputes: state.disputes.filter(d => d.disputeId !== disputeId),
      currentDispute:
        state.currentDispute?.disputeId === disputeId
          ? null
          : state.currentDispute,
    }));
  },

  getDisputesByInvoiceId(invoiceId: AleoField): DisputeRecord[] {
    return get().disputes.filter(d => d.invoiceId === invoiceId);
  },
}));
