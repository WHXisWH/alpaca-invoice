import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';

/**
 * 解析单个 Record（公共逻辑）
 * 
 * @param record - 原始 record 数据（可能是字符串、对象等）
 * @param cryptoService - CryptoService 实例
 * @returns 解析后的 record 对象，包含 invoiceRecord 或 paymentRecord
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
    
    // 处理不同格式的 record
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

    // 转换为 JSON 字符串进行解析
    const recordJsonString = typeof recordData === 'string' 
      ? recordData 
      : JSON.stringify(recordData);
    
    const parsedRecord = await cryptoService.parseAleoRecord<any>(recordJsonString);
    
    // 判断是 PaymentRecord 还是 InvoiceRecord
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

