import { useCallback, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { Invoice, AleoField } from '@/lib/types';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { buildInvoiceFromRecord, updateInvoiceFromPaymentRecord, cleanAleoField } from '@/lib/invoice';
import { cleanAleoNumber } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Hook: 列表页初始化逻辑
 * 
 * 职责：
 * - 处理三种情况的初始化
 * - 从 IndexedDB 加载数据
 * - 检测 SENDING 状态并启动轮询
 */
export function useInvoiceListInitialize(
  onSendingInvoicesFound: (hashes: AleoField[]) => void
) {
  const wallet = useWallet();
  const { publicKey, masterKey } = useUserStore();
  const { 
    getAllInvoices,
    getInvoiceMetadata,
    setInvoices,
    updateInvoice
  } = useInvoiceStore();
  const { scanAllInvoiceRecords, scanAllPaymentRecords } = useInvoiceChainScan();
  
  const [isLoading, setIsLoading] = useState(false);
  const [chainStatusMap, setChainStatusMap] = useState<Map<AleoField, ChainConfirmationStatus>>(new Map());

  /**
   * 情况1：从链上同步所有发票并存入 IndexedDB
   * ✅ 优化：使用按 invoice_id 去重的扫描函数，优先选择 spent=false 的 record
   */
  const syncFromChain = useCallback(async () => {
    if (!masterKey || !publicKey) return;
    
    setIsLoading(true);
    try {
      console.log('📋 [syncFromChain] Case 1: IndexedDB is empty, syncing from chain...');
      
      // ✅ 使用按 invoice_id 去重的扫描函数
      const { byInvoiceId: invoiceRecordsByInvoiceId } = await scanAllInvoiceRecords();
      const paymentRecords = await scanAllPaymentRecords();
      
      if (invoiceRecordsByInvoiceId.size === 0 && paymentRecords.size === 0) {
        console.log('📋 [syncFromChain] No records found on chain');
        return;
      }
      
      // ✅ 构建发票列表（优先使用 PaymentRecord，否则使用 InvoiceRecord）
      const invoices: Invoice[] = [];
      const processedInvoiceIds = new Set<string>();
      
      // 1. 先处理 PaymentRecord（优先级更高）
      for (const [invoiceId, paymentRecord] of paymentRecords.entries()) {
        try {
          // 从 PaymentRecord 构建发票（需要找到对应的 invoice_hash）
          const invoiceRecordData = invoiceRecordsByInvoiceId.get(invoiceId);
          const invoiceHash = invoiceRecordData?.invoiceHash || invoiceId; // fallback to invoiceId
          
          // 构建基础发票对象（使用 InvoiceRecord 数据，如果没有则使用 PaymentRecord 数据）
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
          
          // 使用 PaymentRecord 更新状态为 PAID
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
          console.error(`Failed to process payment record ${invoiceId}:`, error);
          continue;
        }
      }
      
      // 2. 处理剩余的 InvoiceRecord（没有 PaymentRecord 的）
      for (const [invoiceId, invoiceRecordData] of invoiceRecordsByInvoiceId.entries()) {
        if (processedInvoiceIds.has(invoiceId)) {
          continue; // 已经处理过了（有 PaymentRecord）
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
          console.error(`Failed to process invoice ${invoiceId}:`, error);
          continue;
        }
      }
      
      // 3. 批量存入 IndexedDB（metadata 设置为 CONFIRMED）
      if (invoices.length > 0) {
        await setInvoices(invoices, { 
          masterKey, 
          persistFull: true,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            lastUpdated: new Date(),
            dataSource: 'chain'
          }
        });
        
        // ✅ 更新状态映射
        const newStatusMap = new Map<AleoField, ChainConfirmationStatus>();
        for (const invoice of invoices) {
          newStatusMap.set(invoice.invoiceHash, 'CONFIRMED');
        }
        
        setChainStatusMap(newStatusMap);
        console.log(`✅ [syncFromChain] Synced ${invoices.length} invoices from chain with CONFIRMED status`);
      }
    } catch (error) {
      console.error('Failed to sync from chain:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [masterKey, publicKey, scanAllInvoiceRecords, scanAllPaymentRecords, setInvoices]);

  /**
   * 初始化流程：处理三种情况
   */
  const initialize = useCallback(async () => {
    if (!masterKey || !publicKey) return;
    
    setIsLoading(true);
    try {
      // 1. 从 IndexedDB 加载所有发票
      const dbInvoices = await getAllInvoices({ masterKey, refreshMemory: true });
      
      // 2. 加载所有发票的 metadata（用于获取 chainStatus）
      const statusMap = new Map<AleoField, ChainConfirmationStatus>();
      for (const invoice of dbInvoices) {
        const metadata = await getInvoiceMetadata(invoice.invoiceHash);
        if (metadata) {
          statusMap.set(invoice.invoiceHash, metadata.confirmationStatus);
        } else {
          statusMap.set(invoice.invoiceHash, 'SENDING');
        }
      }
      setChainStatusMap(statusMap);
      
      // 3. 判断情况
      if (dbInvoices.length === 0) {
        // 情况1：IndexedDB 为空 → 从链上同步
        console.log('📋 [initialize] Case 1: IndexedDB is empty, syncing from chain...');
        await syncFromChain();
      } else {
        // 情况2：IndexedDB 有数据 → 已加载到内存
        console.log(`📋 [initialize] Case 2: Loaded ${dbInvoices.length} invoices from IndexedDB`);
        
        // 情况3：检查是否有 SENDING 状态的发票
        const sendingHashes: AleoField[] = [];
        for (const [hash, status] of statusMap.entries()) {
          if (status === 'SENDING') {
            sendingHashes.push(hash);
          }
        }
        
        if (sendingHashes.length > 0) {
          console.log(`📋 [initialize] Case 3: Found ${sendingHashes.length} SENDING invoices`);
          // 通知外部启动轮询
          onSendingInvoicesFound(sendingHashes);
        }
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
      toast.error('Failed to load invoices', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [masterKey, publicKey, getAllInvoices, getInvoiceMetadata, syncFromChain, onSendingInvoicesFound]);

  return {
    isLoading,
    chainStatusMap,
    setChainStatusMap,
    initialize
  };
}

