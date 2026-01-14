import { create } from 'zustand';
import { InvoiceState } from './InvoiceState';

/**
 * Invoice Store 实现（新架构）
 * 管理发票的内存状态
 */
export const useInvoiceStore = create<InvoiceState>((set) => ({
  // 初始状态
  invoices: [],
  selectedInvoiceId: null,

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
    set((state) => ({
      invoices: state.invoices.filter((inv) => inv.id !== id),
      selectedInvoiceId: state.selectedInvoiceId === id ? null : state.selectedInvoiceId
    }));
  },

  selectInvoice: (id) => {
    set({ selectedInvoiceId: id });
  },

  clearInvoices: () => {
    set({
      invoices: [],
      selectedInvoiceId: null
    });
  }
}));

