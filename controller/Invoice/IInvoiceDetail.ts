import { AleoField, Invoice, InvoiceStatus } from '@/lib/types';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';

/**
 * 用户在发票中的角色
 */
export type UserRole = 'seller' | 'buyer' | 'unknown';

/**
 * 发票状态配置
 */
export interface StatusConfig {
  label: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}

/**
 * IInvoiceDetail Controller 接口
 * 实现场景B & C：查看详情与Record自动对账
 */
export interface IInvoiceDetail {
  /** 发票对象 */
  invoice: Invoice | null;
  
  /** 当前链上确认状态 */
  currentStatus: ChainConfirmationStatus;
  
  /** 是否正在同步链上记录 */
  isSyncing: boolean;
  
  /** 是否已确认（在链上找到） */
  isConfirmed: boolean;
  
  /** 当前用户在发票中的角色 */
  userRole: UserRole;
  
  /** 发票状态配置 */
  statusConfig: StatusConfig;
  
  /** 是否正在处理操作（支付/取消） */
  isProcessing: boolean;
  
  /** 处理支付 */
  handlePay: () => Promise<void>;
  
  /** 处理取消 */
  handleCancel: () => Promise<void>;
  
  /** 开始轮询扫描链上Record */
  startPolling: () => void;
  
  /** 停止轮询扫描 */
  stopPolling: () => void;
}

