import { IInvoiceStatusValidator, RecordValidationResult } from './IInvoiceStatusValidator';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { InvoiceStatus } from '@/lib/types';
import { cleanAleoNumber } from '@/lib/utils';

/**
 * 发票状态验证服务实现
 * 职责：根据 action 类型验证链上 record 是否符合预期状态
 */
export class InvoiceStatusValidator implements IInvoiceStatusValidator {
  validateRecord(
    record: AleoInvoiceRecord | AleoPaymentRecord | null,
    action: 'create' | 'cancel' | 'pay' | undefined,
    originalInvoiceStatus: InvoiceStatus
  ): RecordValidationResult {
    if (!record) {
      return { 
        shouldConfirm: false, 
        reason: 'No record found' 
      };
    }

    // PaymentRecord 总是可以确认（表示已支付）
    if ('payment_id' in record) {
      return { 
        shouldConfirm: true, 
        reason: 'PaymentRecord found (indicates paid)' 
      };
    }

    // InvoiceRecord 需要根据 action 检查 status
    const invoiceRecord = record as AleoInvoiceRecord;
    const recordStatus = Number(cleanAleoNumber(invoiceRecord.status));

    return this.validateInvoiceRecord(
      recordStatus,
      action,
      originalInvoiceStatus
    );
  }

  private validateInvoiceRecord(
    recordStatus: InvoiceStatus,
    action: 'create' | 'cancel' | 'pay' | undefined,
    originalInvoiceStatus: InvoiceStatus
  ): RecordValidationResult {
    if (action === 'cancel') {
      if (recordStatus === InvoiceStatus.CANCELLED) {
        return { 
          shouldConfirm: true, 
          reason: 'Cancellation confirmed',
          currentStatus: recordStatus,
          expectedStatus: InvoiceStatus.CANCELLED
        };
      }
      return {
        shouldConfirm: false,
        reason: 'Waiting for status to change to CANCELLED',
        currentStatus: recordStatus,
        expectedStatus: InvoiceStatus.CANCELLED
      };
    }

    if (action === 'pay') {
      if (recordStatus === InvoiceStatus.PAID) {
        return {
          shouldConfirm: true,
          reason: 'Payment confirmed',
          currentStatus: recordStatus,
          expectedStatus: InvoiceStatus.PAID
        };
      }
      return {
        shouldConfirm: false,
        reason: 'Waiting for status to change to PAID',
        currentStatus: recordStatus,
        expectedStatus: InvoiceStatus.PAID
      };
    }

    if (action === 'create') {
      return {
        shouldConfirm: true,
        reason: 'Invoice created and found on chain',
        currentStatus: recordStatus
      };
    }

    // 没有 action 或未知 action：使用默认逻辑
    if (originalInvoiceStatus === InvoiceStatus.PENDING && 
        recordStatus === InvoiceStatus.PENDING) {
      return {
        shouldConfirm: true,
        reason: 'Invoice found on chain with matching status',
        currentStatus: recordStatus
      };
    }

    return {
      shouldConfirm: true,
      reason: 'Status changed, confirming',
      currentStatus: recordStatus
    };
  }
}

