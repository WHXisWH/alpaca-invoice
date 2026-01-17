import { Invoice, AleoField } from '@/lib/types';

/**
 * 初始化状态枚举
 */
export enum InitializationStatus {
  IDLE = 'IDLE',                    // 初始状态
  AUTH_REQUIRED = 'AUTH_REQUIRED',  // 需要授权（masterKey不存在）
  LOADING_DB = 'LOADING_DB',        // 正在从IndexedDB加载
  READY = 'READY'                   // 已就绪
}

/**
 * 链上确认状态
 */
export type ChainConfirmationStatus = 'SENDING' | 'CONFIRMED';

/**
 * Invoice Store State
 * 管理发票列表和状态
 */
export interface InvoiceState {
  // 数据
  invoices: Invoice[];           // 所有发票列表
  selectedInvoiceId: AleoField | null;  // 当前选中的发票ID
  
  // 初始化状态
  initStatus: InitializationStatus;  // 初始化状态
  
  // 链上确认状态映射（invoiceHash -> ChainConfirmationStatus）
  confirmationStatus: Map<AleoField, ChainConfirmationStatus>;

  // Actions
  addInvoice: (invoice: Invoice) => void;
  updateInvoice: (id: AleoField, updates: Partial<Invoice>) => void;
  removeInvoice: (id: AleoField) => void;
  selectInvoice: (id: AleoField | null) => void;
  clearInvoices: () => void;
  setInitStatus: (status: InitializationStatus) => void;
  setConfirmationStatus: (invoiceHash: AleoField, status: ChainConfirmationStatus) => void;
  getInvoiceByHash: (hash: AleoField) => Invoice | null;
}
