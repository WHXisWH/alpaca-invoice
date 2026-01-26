import { useCallback, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useUserStore } from '@/stores/User/useUserStore';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { AleoField, Invoice } from '@/lib/types';
import { parseSingleRecord } from '@/lib/recordParser';
import { cleanAleoField, deduplicateInvoiceRecordsByInvoiceId, buildInvoiceFromRecord, updateInvoiceFromPaymentRecord } from '@/lib/invoice';
import { cleanAleoNumber } from '@/lib/utils';

const PROGRAM_ID = 'zk_invoice.aleo';

/**
 * Hook: 链上扫描逻辑（统一版本，可复用）
 * 
 * 职责：
 * - 扫描所有链上 InvoiceRecord（返回 Map）
 * - 扫描所有链上 PaymentRecord（返回 Map）
 * - 扫描单个发票的匹配 record（支持 InvoiceRecord 和 PaymentRecord）
 * - 可被详情页和列表页复用
 */
export function useInvoiceChainScan() {
  const wallet = useWallet();
  const { publicKey } = useUserStore();
  
  // 服务实例
  const walletService = useMemo(() => new WalletService(createWalletAdapter(wallet)), [wallet]);
  const cryptoService = useMemo(() => new CryptoService(), []);

  /**
   * 扫描所有链上 InvoiceRecord
   * 返回 Map<invoiceHash, AleoInvoiceRecord & { originalInvoiceId?: string }>
   * ✅ 改进：正确处理多个相同 invoice_hash 的 records，优先选择 unspent 和更高 status 的
   * ✅ 同时返回按 invoice_id 去重后的 Map（通过 deduplicateInvoiceRecordsByInvoiceId）
   */
  const scanAllInvoiceRecords = useCallback(async (): Promise<{
    byHash: Map<string, AleoInvoiceRecord & { originalInvoiceId?: string }>;
    byInvoiceId: Map<string, {
      record: AleoInvoiceRecord & { originalInvoiceId?: string };
      invoiceHash: string;
    }>;
  }> => {
    const recordsMap = new Map<string, {
      record: AleoInvoiceRecord & { originalInvoiceId?: string };
      spent: boolean;
      statusNum: number;
    }>();
    const rawRecords: Array<{ 
      data: any; 
      spent: boolean;
      invoiceHash: string;
    }> = [];
    
    if (!walletService || !publicKey) {
      return { byHash: new Map(), byInvoiceId: new Map() };
    }

    try {
      console.log('🔍 [scanAllInvoiceRecords] Scanning chain for all invoice records...');
      const response = await walletService.requestRecords(PROGRAM_ID);
      const records: any[] = response.records || [];
      console.log(`📋 [scanAllInvoiceRecords] Found ${records.length} records`);

      for (const record of records) {
        try {
          // ✅ 检查 record 的 spent 状态（与 scanInvoiceRecord 保持一致）
          const isSpent = record?.spent === true || record?.spent === 'true';
          
          // ✅ 在解析之前，从原始 record.data 中提取 invoice_id（保留 .private 后缀）
          let originalInvoiceId: string | undefined;
          let recordData: any;
          if (record && typeof record === 'object' && record.data) {
            recordData = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
            originalInvoiceId = recordData.invoice_id; // 原始的 invoice_id（带 .private）
          }
          
          const parsed = await parseSingleRecord(record, cryptoService);
          if (parsed?.invoiceRecord) {
            const cleanChainHash = cleanAleoField(parsed.invoiceRecord.invoice_hash || '');
            if (cleanChainHash) {
              // ✅ 计算 status 数值（用于择优：CANCELLED=2 > PENDING=0）
              const statusNum = Number(cleanAleoNumber(parsed.invoiceRecord.status));
              
              const candidate = {
                record: {
                  ...parsed.invoiceRecord,
                  originalInvoiceId // 保留原始格式（带 .private）
                },
                spent: isSpent,
                statusNum: statusNum
              };
              
              const existing = recordsMap.get(cleanChainHash);
              
              // ✅ 选择策略：
              // 1. 优先选择 unspent 的 record（spent === false）
              // 2. 如果 spent 状态相同，优先选择 status 更大的（cancelled=2 > pending=0）
              const shouldReplace = !existing || 
                (existing.spent && !isSpent) || // 现有的是 spent，候选的是 unspent
                (existing.spent === isSpent && statusNum > existing.statusNum); // spent 相同，选择 status 更大的
              
              if (shouldReplace) {
                recordsMap.set(cleanChainHash, candidate);
                // 保存原始 record 信息用于去重
                rawRecords.push({
                  data: recordData || record.data,
                  spent: isSpent,
                  invoiceHash: cleanChainHash
                });
                console.log(`✅ [scanAllInvoiceRecords] Selected record for ${cleanChainHash}: spent=${isSpent}, status=${statusNum}`);
              }
            }
          }
        } catch (error) {
          console.warn('Failed to parse record:', error);
          continue;
        }
      }

      // ✅ 转换为按 invoice_hash 索引的 Map
      const byHash = new Map<string, AleoInvoiceRecord & { originalInvoiceId?: string }>();
      for (const [hash, data] of recordsMap.entries()) {
        byHash.set(hash, data.record);
      }

      // ✅ 使用去重函数按 invoice_id 去重
      const byInvoiceId = deduplicateInvoiceRecordsByInvoiceId(byHash, rawRecords);

      console.log(`✅ [scanAllInvoiceRecords] Successfully parsed ${byHash.size} invoice records (by hash), ${byInvoiceId.size} unique invoice_ids`);
      return { byHash, byInvoiceId };
    } catch (error) {
      console.error('Failed to scan chain records:', error);
      return { byHash: new Map(), byInvoiceId: new Map() };
    }
  }, [walletService, publicKey, cryptoService]);

  /**
   * 扫描所有链上 PaymentRecord
   * 返回 Map<invoiceId, AleoPaymentRecord>
   */
  const scanAllPaymentRecords = useCallback(async (): Promise<Map<string, AleoPaymentRecord>> => {
    const recordsMap = new Map<string, AleoPaymentRecord>();
    
    if (!walletService || !publicKey) {
      return recordsMap;
    }

    try {
      console.log('🔍 [scanAllPaymentRecords] Scanning chain for all payment records...');
      const response = await walletService.requestRecords(PROGRAM_ID);
      const records: any[] = response.records || [];
      console.log(`📋 [scanAllPaymentRecords] Found ${records.length} records`);

      for (const record of records) {
        try {
          const parsed = await parseSingleRecord(record, cryptoService);
          if (parsed?.paymentRecord) {
            const cleanInvoiceId = cleanAleoField(parsed.paymentRecord.invoice_id || '');
            if (cleanInvoiceId) {
              recordsMap.set(cleanInvoiceId, parsed.paymentRecord);
            }
          }
        } catch (error) {
          console.warn('Failed to parse record:', error);
          continue;
        }
      }

      console.log(`✅ [scanAllPaymentRecords] Successfully parsed ${recordsMap.size} payment records`);
      return recordsMap;
    } catch (error) {
      console.error('Failed to scan payment records:', error);
      return recordsMap;
    }
  }, [walletService, publicKey, cryptoService]);

  /**
   * 扫描单个发票的匹配 record
   * 支持 InvoiceRecord（通过 invoiceHash 匹配）和 PaymentRecord（通过 invoiceId 匹配）
   * PaymentRecord 优先级更高
   * 
   * ✅ 返回原始 record 对象（用于交易输入）和解析后的数据
   */
  const scanInvoiceRecord = useCallback(async (
    invoiceHash: AleoField,
    invoiceId?: AleoField
  ): Promise<{
    invoiceRecord: AleoInvoiceRecord | null;
    paymentRecord: AleoPaymentRecord | null;
    rawRecord: any | null; // ✅ 新增：原始 record 对象（用于交易输入）
  }> => {
    if (!publicKey || !invoiceHash) {
      console.log('⚠️ [scanInvoiceRecord] Missing publicKey or invoiceHash', { publicKey, invoiceHash });
      return { invoiceRecord: null, paymentRecord: null, rawRecord: null };
    }

    try {
      console.log('🔍 [scanInvoiceRecord] Scanning for invoice:', invoiceHash);
      const response = await walletService.requestRecords(PROGRAM_ID);
      const records: any[] = response.records || [];
      console.log(`📋 [scanInvoiceRecord] Found ${records.length} records`);

      let latestInvoiceRecord: AleoInvoiceRecord | null = null;
      let latestPaymentRecord: AleoPaymentRecord | null = null;
      let rawRecord: any | null = null; // ✅ 保存原始 record 对象

      // ✅ 收集所有匹配的 records（用于处理多个相同 invoice id 的情况）
      const matchingInvoiceRecords: Array<{ record: AleoInvoiceRecord; raw: any; spent: boolean }> = [];
      let matchingPaymentRecord: { record: AleoPaymentRecord; raw: any; spent: boolean } | null = null;

      // 遍历Records，查找匹配的发票
      for (const record of records) {
        try {
          // ✅ 检查 record 的 spent 状态
          const isSpent = record.spent === true || record.spent === 'true';
          
          const parsed = await parseSingleRecord(record, cryptoService);
          
          if (parsed?.paymentRecord && invoiceId) {
            // PaymentRecord - 通过 invoice_id 匹配
            const cleanRecordInvoiceId = cleanAleoField(parsed.paymentRecord.invoice_id || '');
            const cleanCurrentInvoiceId = cleanAleoField(invoiceId);
            
            if (cleanRecordInvoiceId === cleanCurrentInvoiceId) {
              console.log(`✅ [scanInvoiceRecord] Found matching PaymentRecord (spent: ${isSpent}):`, parsed.paymentRecord);
              // ✅ 保存匹配的 PaymentRecord（如果有多个，选择未花费的）
              if (!matchingPaymentRecord || (!isSpent && matchingPaymentRecord.spent)) {
                matchingPaymentRecord = {
                  record: parsed.paymentRecord,
                  raw: record,
                  spent: isSpent
                };
              }
              // PaymentRecord 优先级更高，找到未花费的后可以提前退出
              if (!isSpent) {
                break;
              }
            }
          } else if (parsed?.invoiceRecord) {
            // InvoiceRecord - 通过 invoice_hash 匹配
            const cleanChainHash = cleanAleoField(parsed.invoiceRecord.invoice_hash || '');
            const cleanInvoiceHash = cleanAleoField(invoiceHash);

            if (cleanChainHash === cleanInvoiceHash) {
              console.log(`✅ [scanInvoiceRecord] Found matching InvoiceRecord (spent: ${isSpent}):`, parsed.invoiceRecord);
              // ✅ 收集所有匹配的 InvoiceRecord
              matchingInvoiceRecords.push({
                record: parsed.invoiceRecord,
                raw: record,
                spent: isSpent
              });
            }
          }
        } catch (error) {
          console.warn('Failed to parse record:', error);
          continue;
        }
      }

      // ✅ 选择未花费的 record（spent 为 false）
      if (matchingPaymentRecord && !matchingPaymentRecord.spent) {
        latestPaymentRecord = matchingPaymentRecord.record;
        rawRecord = matchingPaymentRecord.raw;
      } else if (matchingInvoiceRecords.length > 0) {
        // ✅ 从匹配的 InvoiceRecords 中选择未花费的（spent 为 false）
        const unspentRecord = matchingInvoiceRecords.find(r => !r.spent);
        if (unspentRecord) {
          latestInvoiceRecord = unspentRecord.record;
          rawRecord = unspentRecord.raw;
          console.log('✅ [scanInvoiceRecord] Selected unspent InvoiceRecord');
        } else {
          // 如果没有未花费的，使用最新的（可能是已花费的，用于交易输入）
          const latestRecord = matchingInvoiceRecords[matchingInvoiceRecords.length - 1];
          latestInvoiceRecord = latestRecord.record;
          rawRecord = latestRecord.raw;
          console.log('⚠️ [scanInvoiceRecord] No unspent record found, using latest (may be spent)');
        }
      }

      if (!latestInvoiceRecord && !latestPaymentRecord) {
        console.log('❌ [scanInvoiceRecord] No matching record found');
      }

      return { invoiceRecord: latestInvoiceRecord, paymentRecord: latestPaymentRecord, rawRecord };
    } catch (error) {
      console.error('Failed to scan chain records:', error);
      return { invoiceRecord: null, paymentRecord: null, rawRecord: null };
    }
  }, [walletService, publicKey, cryptoService]);

  /**
   * 扫描所有链上 InvoiceRecord（向后兼容）
   * @deprecated 使用 scanAllInvoiceRecords 代替
   */
  const scanAllRecords = useCallback(async () => {
    const result = await scanAllInvoiceRecords();
    return result.byHash; // 返回按 hash 索引的 Map（向后兼容）
  }, [scanAllInvoiceRecords]);

  /**
   * 扫描链上所有发票并构建 Invoice 对象
   * 
   * 职责：
   * - 调用 scanAllInvoiceRecords 和 scanAllPaymentRecords
   * - 合并处理（优先 PaymentRecord）
   * - 构建完整的 Invoice 对象列表
   * 
   * @returns Invoice[] - 已构建好的发票对象数组
   */
  const scanAndBuildInvoices = useCallback(async (): Promise<Invoice[]> => {
    const invoices: Invoice[] = [];
    
    // 1. 扫描链上数据
    const { byInvoiceId: invoiceRecordsByInvoiceId } = await scanAllInvoiceRecords();
    const paymentRecords = await scanAllPaymentRecords();
    
    if (invoiceRecordsByInvoiceId.size === 0 && paymentRecords.size === 0) {
      console.log('📋 [scanAndBuildInvoices] No records found on chain');
      return [];
    }
    
    const processedInvoiceIds = new Set<string>();
    
    // 2. 先处理 PaymentRecord（优先级更高）
    for (const [invoiceId, paymentRecord] of paymentRecords.entries()) {
      try {
        const invoiceRecordData = invoiceRecordsByInvoiceId.get(invoiceId);
        const invoiceHash = invoiceRecordData?.invoiceHash || invoiceId;
        
        // 构建基础发票对象
        const baseInvoice = invoiceRecordData 
          ? buildInvoiceFromRecord(invoiceRecordData.record, invoiceHash as AleoField)
          : {
              id: invoiceId as AleoField,
              invoiceHash: invoiceHash as AleoField,
              seller: paymentRecord.payee as any,
              buyer: paymentRecord.payer as any,
              amount: BigInt(cleanAleoNumber(paymentRecord.amount)) as any,
              dueDate: new Date(),
              createdAt: new Date(),
              status: 1 as any, // PAID
              details: undefined
            } as Invoice;
        
        // 使用 PaymentRecord 更新状态
        const updatedInvoice = updateInvoiceFromPaymentRecord(baseInvoice, paymentRecord);
        const finalInvoice: Invoice = {
          ...baseInvoice,
          ...updatedInvoice,
          id: invoiceRecordData?.record?.originalInvoiceId 
            ? (invoiceRecordData.record.originalInvoiceId as AleoField)
            : (invoiceId as AleoField),
          status: 1, // PAID
          invoiceHash: invoiceHash as AleoField
        };
        
        invoices.push(finalInvoice);
        processedInvoiceIds.add(invoiceId);
      } catch (error) {
        console.error(`[scanAndBuildInvoices] Failed to process payment record ${invoiceId}:`, error);
        continue;
      }
    }
    
    // 3. 处理剩余的 InvoiceRecord
    for (const [invoiceId, invoiceRecordData] of invoiceRecordsByInvoiceId.entries()) {
      if (processedInvoiceIds.has(invoiceId)) {
        continue;
      }
      
      try {
        const invoice = buildInvoiceFromRecord(
          invoiceRecordData.record,
          invoiceRecordData.invoiceHash as AleoField
        );
        
        if (invoiceRecordData.record.originalInvoiceId) {
          invoice.id = invoiceRecordData.record.originalInvoiceId as AleoField;
        }
        
        invoices.push(invoice);
      } catch (error) {
        console.error(`[scanAndBuildInvoices] Failed to process invoice ${invoiceId}:`, error);
        continue;
      }
    }
    
    console.log(`✅ [scanAndBuildInvoices] Built ${invoices.length} invoices from chain`);
    return invoices;
  }, [scanAllInvoiceRecords, scanAllPaymentRecords]);

  return {
    scanAllInvoiceRecords,
    scanAllPaymentRecords,
    scanInvoiceRecord,
    scanAndBuildInvoices, // ✅ 新增：扫描并构建 Invoice 对象
    scanAllRecords // 向后兼容
  };
}

