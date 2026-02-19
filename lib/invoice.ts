import { Invoice, InvoiceStatus, AleoField } from './types';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { cleanAleoNumber } from './utils';
import InvoiceCard from '@/components/invoice-card';

// ============================================================================
// Invoice status configuration
// ============================================================================

/**
 * Invoice status configuration
 */
export interface StatusConfig {
  label: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}

/**
 * Get UI configuration for an invoice status
 *
 * @param status - Invoice status
 * @returns Status configuration object containing label, icon, style classes, etc.
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
// Invoice role determination
// ============================================================================

/**
 * Core role determination logic (pure function, reusable)
 *
 * @param publicKey - Current user's public key
 * @param invoice - Invoice object
 * @returns User role: 'seller' | 'buyer' | 'unknown' | 'both'
 */
export function determineInvoiceRole(
  publicKey: string,
  invoice: Invoice
): 'seller' | 'buyer' | 'unknown' | 'both' {
  if (!publicKey || !invoice) return 'unknown';

  // Clean address strings, remove possible visibility modifiers
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
// Invoice utility functions
// ============================================================================

/**
 * Build an Invoice object from an on-chain InvoiceRecord
 *
 * @param record - On-chain InvoiceRecord
 * @param invoiceHash - Invoice hash
 * @returns Constructed Invoice object
 */
export function buildInvoiceFromRecord(
  record: AleoInvoiceRecord,
  invoiceHash: AleoField
): Invoice {
  // If invoice_id does not exist, use invoiceHash as fallback
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
    taxAmount: record.tax_amount ? BigInt(cleanAleoNumber(record.tax_amount)) as any : undefined,
    dueDate: new Date(Number(cleanDueDate) * 1000),
    createdAt: Number(cleanCreatedAt) > 0
      ? new Date(Number(cleanCreatedAt) * 1000)
      : new Date(),
    status: Number(cleanStatus) as any,
    orderId: record.order_id ? cleanAleoField(record.order_id) as AleoField : undefined,
    currency: record.currency ? cleanAleoField(record.currency) as AleoField : undefined,
    itemsHash: record.items_hash ? cleanAleoField(record.items_hash) as AleoField : undefined,
    memoHash: record.memo_hash ? cleanAleoField(record.memo_hash) as AleoField : undefined,
    details: undefined // On-chain data does not include details
  };
}

/**
 * Update an Invoice object from a PaymentRecord
 *
 * @param invoice - Original invoice object
 * @param paymentRecord - On-chain PaymentRecord
 * @returns Updated partial invoice data
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
    status: 1 as any, // PaymentRecord indicates paid
    nonce: invoice.nonce,       // Preserve local-only field
    auditKey: invoice.auditKey  // Preserve local-only field
  };
}

/**
 * Update an Invoice object from an InvoiceRecord
 *
 * @param invoice - Original invoice object
 * @param invoiceRecord - On-chain InvoiceRecord
 * @returns Updated partial invoice data
 */
export function updateInvoiceFromInvoiceRecord(
  invoice: Invoice,
  invoiceRecord: AleoInvoiceRecord
): Partial<Invoice> {
  // If invoice_id does not exist, use original invoice.id as fallback
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
    taxAmount: invoiceRecord.tax_amount ? BigInt(cleanAleoNumber(invoiceRecord.tax_amount)) as any : invoice.taxAmount,
    dueDate: new Date(Number(cleanDueDate) * 1000),
    createdAt: Number(cleanCreatedAt) > 0
      ? new Date(Number(cleanCreatedAt) * 1000)
      : invoice.createdAt,
    status: Number(cleanStatus) as any,
    orderId: invoiceRecord.order_id ? cleanAleoField(invoiceRecord.order_id) as AleoField : invoice.orderId,
    currency: invoiceRecord.currency ? cleanAleoField(invoiceRecord.currency) as AleoField : invoice.currency,
    itemsHash: invoiceRecord.items_hash ? cleanAleoField(invoiceRecord.items_hash) as AleoField : invoice.itemsHash,
    memoHash: invoiceRecord.memo_hash ? cleanAleoField(invoiceRecord.memo_hash) as AleoField : invoice.memoHash,
    nonce: invoice.nonce,       // Preserve local-only field
    auditKey: invoice.auditKey  // Preserve local-only field
  };
}

/**
 * Clean Aleo field visibility modifiers
 *
 * @param field - Aleo field string
 * @returns Cleaned field string
 */
export function cleanAleoField(field: string): string {
  return field.replace(/field\.(private|public)$/, 'field');
}

/**
 * Deduplicate InvoiceRecord Map by invoice_id
 * If there are multiple records with the same invoice_id, prefer the one with spent set to false
 *
 * @param recordsByHash - InvoiceRecord Map indexed by invoice_hash (already contains originalInvoiceId)
 * @param rawRecords - Array of raw record objects (used to extract spent status)
 * @returns Deduplicated Map indexed by invoice_id, containing record and invoiceHash
 */
export function deduplicateInvoiceRecordsByInvoiceId(
  recordsByHash: Map<string, AleoInvoiceRecord & { originalInvoiceId?: string }>,
  rawRecords: Array<{
    data: any;
    spent: boolean;
    invoiceHash: string;
  }>
): Map<string, {
  record: AleoInvoiceRecord & { originalInvoiceId?: string };
  invoiceHash: string;
}> {
  const recordsMap = new Map<string, {
    record: AleoInvoiceRecord & { originalInvoiceId?: string };
    invoiceHash: string;
    spent: boolean;
    statusNum: number;
  }>();

  // Build an index of rawRecords (by invoiceHash, to get spent status)
  const rawRecordsByHash = new Map<string, boolean>();
  for (const rawRecord of rawRecords) {
    rawRecordsByHash.set(rawRecord.invoiceHash, rawRecord.spent);
  }

  // Iterate through all InvoiceRecords, deduplicate by invoice_id
  for (const [invoiceHash, record] of recordsByHash.entries()) {
    const cleanInvoiceId = cleanAleoField(record.invoice_id || '');
    if (!cleanInvoiceId) {
      continue; // Skip records without invoice_id
    }

    const isSpent = rawRecordsByHash.get(invoiceHash) || false;
    const statusNum = Number(cleanAleoNumber(record.status));

    const candidate = {
      record: record, // record already contains originalInvoiceId
      invoiceHash: invoiceHash,
      spent: isSpent,
      statusNum: statusNum
    };

    const existing = recordsMap.get(cleanInvoiceId);

    // Selection strategy:
    // 1. Prefer unspent records (spent === false)
    // 2. If spent status is the same, prefer the one with a higher status (cancelled=2 > pending=0)
    const shouldReplace = !existing ||
      (existing.spent && !isSpent) || // Existing is spent, candidate is unspent
      (existing.spent === isSpent && statusNum > existing.statusNum); // Same spent status, select higher status

    if (shouldReplace) {
      recordsMap.set(cleanInvoiceId, candidate);
      console.log(`[deduplicateInvoiceRecordsByInvoiceId] Selected record for invoice_id ${cleanInvoiceId}: spent=${isSpent}, status=${statusNum}, hash=${invoiceHash}`);
    }
  }

  // Convert to final format
  const result = new Map<string, {
    record: AleoInvoiceRecord & { originalInvoiceId?: string };
    invoiceHash: string;
  }>();
  for (const [invoiceId, data] of recordsMap.entries()) {
    result.set(invoiceId, {
      record: data.record,
      invoiceHash: data.invoiceHash
    });
  }

  console.log(`[deduplicateInvoiceRecordsByInvoiceId] Deduplicated ${recordsByHash.size} records to ${result.size} unique invoice_ids`);
  return result;
}
