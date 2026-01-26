import { useCallback, useState } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoField } from '@/lib/types';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { toast } from 'sonner';

/**
 * Hook: 列表页初始化逻辑
 * 
 * 职责：
 * - 处理两种情况的初始化
 *   1. IndexedDB 为空 → 从链上扫描并存入
 *   2. IndexedDB 有数据 → 加载到内存
 * - 检查是否有 SENDING 状态的发票，通过回调通知上层
 * - 列表页只显示已确认的发票，不需要轮询
 * 
 * @param onSendingInvoicesFound - 发现 SENDING 状态发票时的回调
 */
export function useInvoiceListInitialize(
  onSendingInvoicesFound?: (invoiceHashes: AleoField[]) => void
) {
  const { publicKey, masterKey } = useUserStore();
  const { 
    getAllInvoices,
    getInvoiceMetadata,
    setInvoices
  } = useInvoiceStore();
  const { scanAndBuildInvoices } = useInvoiceChainScan();
  
  const [isLoading, setIsLoading] = useState(false);
  const [chainStatusMap, setChainStatusMap] = useState<Map<AleoField, ChainConfirmationStatus>>(new Map());

  /**
   * 情况1：从链上同步所有发票并存入 IndexedDB
   * ✅ 优化：使用 scanAndBuildInvoices 统一构建 Invoice 对象
   */
  const syncFromChain = useCallback(async () => {
    if (!masterKey || !publicKey) return;
    
    setIsLoading(true);
    try {
      console.log('📋 [syncFromChain] Case 1: IndexedDB is empty, syncing from chain...');
      
      // ✅ 直接调用 scanAndBuildInvoices 获取构建好的 Invoice 对象
      const invoices = await scanAndBuildInvoices();
      
      if (invoices.length === 0) {
        console.log('📋 [syncFromChain] No records found on chain');
        return;
      }
      
      // ✅ 批量存入 IndexedDB（metadata 设置为 CONFIRMED）
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
    } catch (error) {
      console.error('Failed to sync from chain:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [masterKey, publicKey, scanAndBuildInvoices, setInvoices]);

  /**
   * 初始化流程：处理三种情况
   * - 情况1：IndexedDB 为空 → 从链上同步（需要 masterKey）
   * - 情况2：IndexedDB 有数据，无 SENDING 状态 → 已加载到内存
   * - 情况3：IndexedDB 有数据，有 SENDING 状态 → 通知上层启动轮询
   * 
   * ✅ masterKey 不是必需的：
   * - 有 masterKey：可以解密 details，可以同步数据到 IndexedDB
   * - 无 masterKey：只能读取基本信息，不解密 details，不能同步到 IndexedDB
   */
  const initialize = useCallback(async () => {
    // ✅ 只需要 publicKey，不强制要求 masterKey
    if (!publicKey) {
      console.log('⚠️ [initialize] No publicKey, skipping initialization');
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('📋 [initialize] Starting initialization with masterKey:', !!masterKey);
      
      // 1. 从 IndexedDB 加载所有发票
      // ✅ 传入 masterKey（可能是 null/undefined），getAllInvoices 会处理
      const dbInvoices = await getAllInvoices({ 
        masterKey: masterKey || undefined, 
        refreshMemory: true 
      });
      
      // 2. 加载所有发票的 metadata（用于获取 chainStatus）
      const statusMap = new Map<AleoField, ChainConfirmationStatus>();
      const sendingInvoiceHashes: AleoField[] = [];
      
      for (const invoice of dbInvoices) {
        const metadata = await getInvoiceMetadata(invoice.invoiceHash);
        if (metadata) {
          statusMap.set(invoice.invoiceHash, metadata.confirmationStatus);
          // ✅ 检查是否有 SENDING 状态的发票
          if (metadata.confirmationStatus === 'SENDING') {
            sendingInvoiceHashes.push(invoice.invoiceHash);
          }
        } else {
          statusMap.set(invoice.invoiceHash, 'SENDING');
          sendingInvoiceHashes.push(invoice.invoiceHash);
        }
      }
      setChainStatusMap(statusMap);
      
      // 3. 判断情况
      if (dbInvoices.length === 0) {
        // 情况1：IndexedDB 为空 → 从链上同步
        // ✅ 只有在有 masterKey 时才同步（因为需要加密存储到 IndexedDB）
        if (masterKey) {
          console.log('📋 [initialize] Case 1: IndexedDB is empty, syncing from chain...');
          await syncFromChain();
        } else {
          console.log('📋 [initialize] Case 1: IndexedDB is empty, but no masterKey for sync');
          console.log('💡 Tip: Unlock to sync invoices from chain');
        }
      } else if (sendingInvoiceHashes.length > 0) {
        // 情况3：有 SENDING 状态的发票 → 通知上层启动轮询
        console.log(`📋 [initialize] Case 3: Found ${sendingInvoiceHashes.length} SENDING invoices, notifying...`);
        onSendingInvoicesFound?.(sendingInvoiceHashes);
      } else {
        // 情况2：IndexedDB 有数据，无 SENDING 状态 → 已加载到内存
        console.log(`📋 [initialize] Case 2: Loaded ${dbInvoices.length} invoices from IndexedDB`);
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

