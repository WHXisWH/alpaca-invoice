import { useCallback, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { Invoice, AleoField } from '@/lib/types';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { buildInvoiceFromRecord } from '@/lib/invoice';
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
  const { scanAllRecords } = useInvoiceChainScan();
  
  const [isLoading, setIsLoading] = useState(false);
  const [chainStatusMap, setChainStatusMap] = useState<Map<AleoField, ChainConfirmationStatus>>(new Map());

  /**
   * 情况1：从链上同步所有发票并存入 IndexedDB
   */
  const syncFromChain = useCallback(async () => {
    if (!masterKey || !publicKey) return;
    
    setIsLoading(true);
    try {
      console.log('📋 [syncFromChain] Case 1: IndexedDB is empty, syncing from chain...');
      
      // 1. 扫描链上所有 records
      const chainRecords = await scanAllRecords();
      
      if (chainRecords.size === 0) {
        console.log('📋 [syncFromChain] No records found on chain');
        return;
      }
      
      // 2. 构建发票列表（✅ 使用公共函数）
      const invoices: Invoice[] = [];
      for (const [invoiceHash, record] of chainRecords.entries()) {
        try {
          // ✅ 使用公共函数构建发票
          const invoice = buildInvoiceFromRecord(record, invoiceHash as AleoField);
          
          // ✅ 如果 record 有原始的 invoice_id（带 .private 后缀），使用它作为 invoice.id（用于 IndexedDB key）
          // 这样存储到 IndexedDB 时就能正确使用原始的 invoice_id 作为 key
          if ((record as any).originalInvoiceId) {
            invoice.id = (record as any).originalInvoiceId as AleoField; // 保留原始格式（带 .private）
          }
          
          invoices.push(invoice);
        } catch (error) {
          console.error(`Failed to process invoice ${invoiceHash}:`, error);
          continue;
        }
      }
      
      // 3. 批量存入 IndexedDB（metadata 设置为 CONFIRMED）
      if (invoices.length > 0) {
        // ✅ 直接传入正确的 metadata，避免后续再调用 updateInvoice
        await setInvoices(invoices, { 
          masterKey, 
          persistFull: true,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            lastUpdated: new Date(),
            dataSource: 'chain'
          }
        });
        
        // ✅ 更新状态映射（不再需要逐个调用 updateInvoice）
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
  }, [masterKey, publicKey, scanAllRecords, setInvoices, updateInvoice]);

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

