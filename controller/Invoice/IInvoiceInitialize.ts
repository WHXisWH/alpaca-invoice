import { InitializationStatus } from '@/stores/Invoice/InvoiceState';

/**
 * IInvoiceInitialize Controller 接口
 * 实现场景A：初始化加载（冷启动）
 */
export interface IInvoiceInitialize {
  /** 初始化状态 */
  initStatus: InitializationStatus;
  
  /** 手动触发初始化 */
  initialize: () => Promise<void>;
  
  /** 处理用户点击解锁（请求授权并派生masterKey） */
  handleUnlock: () => Promise<void>;
  
  /** 是否需要授权（masterKey不存在） */
  isAuthRequired: boolean;
  
  /** 是否正在加载（从IndexedDB加载发票） */
  isLoading: boolean;
  
  /** 是否已就绪（初始化完成） */
  isReady: boolean;
}

