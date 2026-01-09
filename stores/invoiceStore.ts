'use client';

import { create } from 'zustand';
import type {
  AleoField,
  CreateInvoiceParams,
  CreateInvoiceResult,
  Invoice,
  PaymentReceipt,
  PaymentResult
} from '@/lib/types';
import { invoiceService } from '@/services/invoiceService';
import { paymentService } from '@/services/paymentService';
import { useWalletStore } from './walletStore';

interface InvoiceState {
  sentInvoices: Invoice[];
  receivedInvoices: Invoice[];
  paymentReceipts: PaymentReceipt[];
  selectedInvoice: Invoice | null;
  rawInvoices: Invoice[];
  mappingStatuses: Map<string, number>;
  lastSyncHeight: number;
  filter: 'all' | 'pending' | 'paid' | 'cancelled';
  isLoading: boolean;
  error: string | null;
}

interface InvoiceActions {
  fetchInvoices: () => Promise<void>;
  createInvoice: (params: CreateInvoiceParams) => Promise<CreateInvoiceResult>;
  payInvoice: (id: AleoField) => Promise<PaymentResult>;
  cancelInvoice: (id: AleoField) => Promise<void>;
  selectInvoice: (invoice: Invoice | null) => void;
  setFilter: (filter: InvoiceState['filter']) => void;
}

type InvoiceStore = InvoiceState & InvoiceActions;

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  sentInvoices: [],
  receivedInvoices: [],
  paymentReceipts: [],
  selectedInvoice: null,
  rawInvoices: [],
  mappingStatuses: new Map(),
  lastSyncHeight: 0,
  filter: 'all',
  isLoading: false,
  error: null,
  fetchInvoices: async () => {
    const { address } = useWalletStore.getState();
    const sent = await invoiceService.listByRole('seller', address || undefined);
    const received = await invoiceService.listByRole('buyer', address || undefined);
    set({
      sentInvoices: sent,
      receivedInvoices: received,
      rawInvoices: [...sent, ...received]
    });
  },
  createInvoice: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoiceService.create(params);
      await get().fetchInvoices();
      set({ isLoading: false });
      return result;
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message });
      throw err;
    }
  },
  payInvoice: async (id) => {
    set({ isLoading: true, error: null });
    try {
      // Get invoice from service (localStorage)
      const invoice = await invoiceService.getById(id);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Call payment service
      const result = await paymentService.pay({
        invoice: invoice,
        recipientAddress: invoice.seller,
        amount: invoice.amount
      });

      // Update invoice status
      await invoiceService.markAsPaid(id);

      // Fetch updated data
      await get().fetchInvoices();
      const receipts = await paymentService.listReceipts();
      set({ paymentReceipts: receipts, isLoading: false });

      return result;
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message });
      throw err;
    }
  },
  cancelInvoice: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await invoiceService.cancel(id);
      await get().fetchInvoices();
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message });
      throw err;
    }
  },
  selectInvoice: (invoice) => set({ selectedInvoice: invoice }),
  setFilter: (filter) => set({ filter })
}));
