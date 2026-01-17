// services/StorageService.ts
import { AleoField, EncryptedPayload } from '@/lib/types';

/** * Storage 异常枚举 */
export enum StorageError {
  WRITE_FAILED = 'WRITE_FAILED',   // 磁盘满或存储权限被拒绝
  READ_FAILED = 'READ_FAILED',     // 数据损坏或索引不存在
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED' // 存储配额超出限制
}

export interface InvoiceWithHash {
  invoiceHash: AleoField;
  payload: EncryptedPayload;
}

export interface IStorageService {
  /**
   * 存储加密后的发票明细
   * 以 invoiceHash 为键，确保存证与明细的一一对应
   */
  saveEncryptedInvoice(
    invoiceHash: AleoField, 
    payload: EncryptedPayload
  ): Promise<void>;

  /**
   * 读取加密后的发票明细
   */
  getEncryptedInvoice(invoiceHash: AleoField): Promise<EncryptedPayload | null>;

  /**
   * 获取所有加密的发票明细（用于批量加载）
   */
  getAllEncryptedInvoices(): Promise<InvoiceWithHash[]>;

  /**
   * 删除本地缓存（用于用户注销或清理空间）
   */
  deleteInvoice(invoiceHash: AleoField): Promise<void>;

  /**
   * 存储同步高度（用于 AleoProtocolService 的增量扫描）
   */
  setLastSyncHeight(height: number): Promise<void>;
  getLastSyncHeight(): Promise<number>;
}