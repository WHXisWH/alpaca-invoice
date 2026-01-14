import { Invoice, AleoField } from '@/lib/types';

/**
 * Invoice Store State
 * 管理发票列表和状态
 */
export interface InvoiceState {
  // 数据
  invoices: Invoice[];           // 所有发票列表
  selectedInvoiceId: AleoField | null;  // 当前选中的发票ID

  // Actions
  addInvoice: (invoice: Invoice) => void;
  updateInvoice: (id: AleoField, updates: Partial<Invoice>) => void;
  removeInvoice: (id: AleoField) => void;
  selectInvoice: (id: AleoField | null) => void;
  clearInvoices: () => void;
}
