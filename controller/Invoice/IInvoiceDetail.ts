import { Invoice, AleoField } from '@/lib/types';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { StatusConfig } from '@/lib/invoice';

/**
 * 用户在发票中的角色
 */
export type UserRole = 'seller' | 'buyer' | 'unknown';

// 重新导出 StatusConfig（保持向后兼容）
export type { StatusConfig };

/**
 * IInvoiceDetail Controller 接口
 * 实现场景B & C：查看详情与Record自动对账
 */
export interface IInvoiceDetail {
  /** 发票对象 */
  invoice: Invoice | null;
  
  /** 是否正在加载发票（从 IndexedDB） */
  isLoadingInvoice: boolean;
  
  /** 当前链上确认状态（null 表示尚未加载） */
  currentStatus: ChainConfirmationStatus | null;
  
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
  
  /** 是否正在手动同步状态 */
  isSyncingStatus: boolean;
  
  /** 处理支付（直接使用 hook 的 invoice） */
  handlePay: () => Promise<void>;
  
  /** 处理取消（直接使用 hook 的 invoice） */
  handleCancel: () => Promise<void>;
  
  /** 手动同步发票状态（从链上获取最新 record） */
  handleSyncStatus: () => Promise<void>;
  
  /** 开始轮询扫描链上Record */
  startPolling: () => void;
  
  /** 停止轮询扫描 */
  stopPolling: () => void;
}

