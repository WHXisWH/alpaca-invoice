import { create } from 'zustand';
import { InvoiceState, InitializationStatus, ChainConfirmationStatus } from './InvoiceState';

/**
 * Invoice Store 实现（新架构）
 * 管理发票的内存状态
 */
export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  // 初始状态
  invoices: [],
  selectedInvoiceId: null,
  initStatus: InitializationStatus.IDLE,
  confirmationStatus: new Map(),

  // Actions
  addInvoice: (invoice) => {
    set((state) => ({
      invoices: [...state.invoices, invoice]
    }));
  },

  updateInvoice: (id, updates) => {
    set((state) => ({
      invoices: state.invoices.map((inv) =>
        inv.id === id ? { ...inv, ...updates } : inv
      )
    }));
  },

  removeInvoice: (id) => {
    set((state) => {
      const newStatus = new Map(state.confirmationStatus);
      newStatus.delete(id);
      return {
        invoices: state.invoices.filter((inv) => inv.id !== id),
        selectedInvoiceId: state.selectedInvoiceId === id ? null : state.selectedInvoiceId,
        confirmationStatus: newStatus
      };
    });
  },

  selectInvoice: (id) => {
    set({ selectedInvoiceId: id });
  },

  clearInvoices: () => {
    set({
      invoices: [],
      selectedInvoiceId: null,
      confirmationStatus: new Map()
    });
  },

  setInitStatus: (status) => {
    set({ initStatus: status });
  },

  setConfirmationStatus: (invoiceHash, status) => {
    set((state) => {
      const newStatus = new Map(state.confirmationStatus);
      newStatus.set(invoiceHash, status);
      return { confirmationStatus: newStatus };
    });
  },

  getInvoiceByHash: (hash) => {
    const state = get();
    return state.invoices.find((inv) => inv.invoiceHash === hash) || null;
  }
}));

