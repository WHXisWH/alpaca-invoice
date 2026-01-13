import { Invoice, AleoField, InvoiceStatus } from "@/lib/types";

export interface InvoiceState {
  invoices: Invoice[];              // 原始 Invoice 对象数组
  lastSyncHeight: number;           // 上次增量扫描的高度，交给 Service 提效
  isInitialLoading: boolean;        // 初次加载状态
  
  // Actions
  setInvoices: (invoices: Invoice[]) => void;
  addInvoice: (invoice: Invoice) => void;
  updateInvoiceStatus: (id: AleoField, status: InvoiceStatus) => void;
  setSyncHeight: (height: number) => void;
}