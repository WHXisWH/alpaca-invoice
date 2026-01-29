import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';

/**
 * Parse a single Record (shared logic)
 *
 * @param record - Raw record data (may be a string, object, etc.)
 * @param cryptoService - CryptoService instance
 * @returns Parsed record object, containing invoiceRecord or paymentRecord
 */
export async function parseSingleRecord(
  record: any,
  cryptoService: CryptoService
): Promise<{
  invoiceRecord?: AleoInvoiceRecord;
  paymentRecord?: AleoPaymentRecord;
} | null> {
  try {
    let recordData: any;

    // Handle different record formats
    if (typeof record === 'string') {
      recordData = JSON.parse(record);
    } else if (record && typeof record === 'object') {
      if (record.data) {
        recordData = typeof record.data === 'string'
          ? JSON.parse(record.data)
          : record.data;
      } else {
        recordData = record;
      }
    } else {
      return null;
    }

    if (!recordData) return null;

    // Convert to JSON string for parsing
    const recordJsonString = typeof recordData === 'string'
      ? recordData
      : JSON.stringify(recordData);

    const parsedRecord = await cryptoService.parseAleoRecord<any>(recordJsonString);

    // Determine whether this is a PaymentRecord or an InvoiceRecord
    const isPaymentRecord = 'payment_id' in parsedRecord && parsedRecord.payment_id;
    const isInvoiceRecord = 'invoice_hash' in parsedRecord && parsedRecord.invoice_hash;

    if (isPaymentRecord) {
      return { paymentRecord: parsedRecord as AleoPaymentRecord };
    } else if (isInvoiceRecord) {
      return { invoiceRecord: parsedRecord as AleoInvoiceRecord };
    }

    return null;
  } catch (error) {
    console.warn('Failed to parse record:', error);
    return null;
  }
}

