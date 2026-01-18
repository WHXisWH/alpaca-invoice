'use client';

import { create } from 'zustand';
import {
  type AleoField,
  type CreateInvoiceParams,
  type CreateInvoiceResult,
  type Invoice,
  type PaymentReceipt,
  type PaymentResult,
  InvoiceStatus
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
      // 阶段 0: 获取发票信息
      console.log('[InvoiceStore] Step 0: Fetching invoice from localStorage...');
      const invoice = await invoiceService.getById(id);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status !== InvoiceStatus.PENDING) {
        throw new Error(`Cannot pay invoice with status: ${InvoiceStatus[invoice.status]}`);
      }

      console.log('[InvoiceStore] Invoice found:', {
        id: invoice.id,
        amount: invoice.amount.toString(),
        seller: invoice.seller
      });

      // 阶段 1: 执行支付流程
      console.log('[InvoiceStore] Step 1: Executing payment process...');
      const result = await paymentService.pay({
        invoice: invoice,
        recipientAddress: invoice.seller,
        amount: invoice.amount
      });

      console.log('[InvoiceStore] Payment completed:', {
        transactionId: result.transactionId,
        paymentId: result.paymentId
      });

      // 阶段 2: 更新本地发票状态
      console.log('[InvoiceStore] Step 2: Updating local invoice status...');
      await invoiceService.markAsPaid(id);

      // 阶段 3: 刷新数据
      console.log('[InvoiceStore] Step 3: Refreshing invoice list and receipts...');
      await get().fetchInvoices();
      const receipts = await paymentService.listReceipts();
      
      set({ 
        paymentReceipts: receipts, 
        isLoading: false,
        error: null
      });

      console.log('[InvoiceStore] Payment flow completed successfully');
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('[InvoiceStore] Payment failed:', errorMessage);
      set({ 
        isLoading: false, 
        error: errorMessage
      });
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
