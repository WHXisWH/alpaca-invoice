import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { InvoiceStatus } from '@/lib/types';

/**
 * 发票状态验证结果
 */
export interface RecordValidationResult {
  shouldConfirm: boolean;
  reason: string;
  expectedStatus?: InvoiceStatus;
  currentStatus?: InvoiceStatus;
}

/**
 * 发票状态验证服务接口
 * 职责：根据 action 类型验证链上 record 是否符合预期状态
 */
export interface IInvoiceStatusValidator {
  /**
   * 验证 record 是否符合预期状态
   * @param record 链上记录（InvoiceRecord 或 PaymentRecord）
   * @param action 当前操作类型（create/cancel/pay）
   * @param originalInvoiceStatus 发票的原始状态
   * @returns 验证结果
   */
  validateRecord(
    record: AleoInvoiceRecord | AleoPaymentRecord | null,
    action: 'create' | 'cancel' | 'pay' | undefined,
    originalInvoiceStatus: InvoiceStatus
  ): RecordValidationResult;
}

