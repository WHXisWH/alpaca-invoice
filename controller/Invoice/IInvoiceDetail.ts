import { AleoField, Invoice } from '@/lib/types';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';

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
  
  /** 开始轮询扫描链上Record */
  startPolling: () => void;
  
  /** 停止轮询扫描 */
  stopPolling: () => void;
}

