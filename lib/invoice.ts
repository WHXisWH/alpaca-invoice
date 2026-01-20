import { Invoice, InvoiceStatus, AleoField } from './types';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { cleanAleoNumber } from './utils';
import InvoiceCard from '@/components/invoice-card';

// ============================================================================
// 发票状态配置
// ============================================================================

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
 * 获取发票状态的 UI 配置
 * 
 * @param status - 发票状态
 * @returns 状态配置对象，包含标签、图标、样式类等
 */
export function getStatusConfig(status: InvoiceStatus): StatusConfig {
  switch (status) {
    case InvoiceStatus.PENDING:
      return {
        label: 'Pending',
        icon: '⏳',
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-300'
      };
    case InvoiceStatus.PAID:
      return {
        label: 'Paid',
        icon: '✅',
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-300'
      };
    case InvoiceStatus.CANCELLED:
      return {
        label: 'Cancelled',
        icon: '❌',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
    case InvoiceStatus.EXPIRED:
      return {
        label: 'Expired',
        icon: '⚠️',
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-300'
      };
    default:
      return {
        label: 'Unknown',
        icon: '❓',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
  }
}

// ============================================================================
// 发票角色判断
// ============================================================================

/**
 * 核心角色判断逻辑（纯函数，可复用）
 * 
 * @param publicKey - 当前用户的公钥
 * @param invoice - 发票对象
 * @returns 用户角色：'seller' | 'buyer' | 'unknown' | 'both'
 */
export function determineInvoiceRole(
  publicKey: string,
  invoice: Invoice
): 'seller' | 'buyer' | 'unknown' | 'both' {
  if (!publicKey || !invoice) return 'unknown';
  
  // 清理地址字符串，移除可能的可见性修饰符
  const cleanPublicKey = publicKey.replace(/\.(private|public)$/, '');
  const cleanSeller = invoice.seller.replace(/\.(private|public)$/, '');
  const cleanBuyer = invoice.buyer.replace(/\.(private|public)$/, '');
  
  const isSeller = cleanPublicKey === cleanSeller;
  const isBuyer = cleanPublicKey === cleanBuyer;
  
  if (isSeller && isBuyer) return 'both';
  if (isSeller) return 'seller';
  if (isBuyer) return 'buyer';
  return 'unknown';
}

// ============================================================================
// 发票工具函数
// ============================================================================

/**
 * 从链上 InvoiceRecord 构建 Invoice 对象
 * 
 * @param record - 链上的 InvoiceRecord
 * @param invoiceHash - 发票 hash
 * @returns 构建的 Invoice 对象
 */
export function buildInvoiceFromRecord(
  record: AleoInvoiceRecord,
  invoiceHash: AleoField
): Invoice {
  // ✅ 如果 invoice_id 不存在，使用 invoiceHash 作为 fallback
  const cleanInvoiceId = (record.invoice_id?.replace(/field\.(private|public)$/, 'field') || invoiceHash) as AleoField;
  const cleanAmount = cleanAleoNumber(record.amount);
  const cleanDueDate = cleanAleoNumber(record.due_date);
  const cleanCreatedAt = cleanAleoNumber(record.created_at);
  const cleanStatus = cleanAleoNumber(record.status);

  return {
    id: cleanInvoiceId,
    invoiceHash: invoiceHash,
    seller: record.seller as any,
    buyer: record.buyer as any,
    amount: BigInt(cleanAmount) as any,
    dueDate: new Date(Number(cleanDueDate) * 1000),
    createdAt: new Date(Number(cleanCreatedAt) * 1000),
    status: Number(cleanStatus) as any,
    details: undefined // 链上数据不包含 details
  };
}

/**
 * 从 PaymentRecord 更新 Invoice 对象
 * 
 * @param invoice - 原始发票对象
 * @param paymentRecord - 链上的 PaymentRecord
 * @returns 更新后的发票部分数据
 */
export function updateInvoiceFromPaymentRecord(
  invoice: Invoice,
  paymentRecord: AleoPaymentRecord
): Partial<Invoice> {
  const cleanInvoiceId = paymentRecord.invoice_id?.replace(/field\.(private|public)$/, 'field') as AleoField;
  const cleanAmount = cleanAleoNumber(paymentRecord.amount);

  return {
    id: cleanInvoiceId,
    invoiceHash: invoice.invoiceHash, // Keep original hash
    seller: paymentRecord.payee as any,
    buyer: paymentRecord.payer as any,
    amount: BigInt(cleanAmount) as any,
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt,
    status: 1 as any // PaymentRecord indicates paid
  };
}

/**
 * 从 InvoiceRecord 更新 Invoice 对象
 * 
 * @param invoice - 原始发票对象
 * @param invoiceRecord - 链上的 InvoiceRecord
 * @returns 更新后的发票部分数据
 */
export function updateInvoiceFromInvoiceRecord(
  invoice: Invoice,
  invoiceRecord: AleoInvoiceRecord
): Partial<Invoice> {
  // ✅ 如果 invoice_id 不存在，使用原 invoice.id 作为 fallback
  const cleanInvoiceId = (invoiceRecord.invoice_id?.replace(/field\.(private|public)$/, 'field') || invoice.id) as AleoField;
  const cleanAmount = cleanAleoNumber(invoiceRecord.amount);
  const cleanDueDate = cleanAleoNumber(invoiceRecord.due_date);
  const cleanCreatedAt = cleanAleoNumber(invoiceRecord.created_at);
  const cleanStatus = cleanAleoNumber(invoiceRecord.status);

  return {
    id: cleanInvoiceId,
    invoiceHash: invoice.invoiceHash, // Keep original hash
    seller: invoiceRecord.seller as any,
    buyer: invoiceRecord.buyer as any,
    amount: BigInt(cleanAmount) as any,
    dueDate: new Date(Number(cleanDueDate) * 1000),
    createdAt: new Date(Number(cleanCreatedAt) * 1000),
    status: Number(cleanStatus) as any
  };
}

/**
 * 清理 Aleo 字段的可见性修饰符
 * 
 * @param field - Aleo 字段字符串
 * @returns 清理后的字段字符串
 */
export function cleanAleoField(field: string): string {
  return field.replace(/field\.(private|public)$/, 'field');
}
