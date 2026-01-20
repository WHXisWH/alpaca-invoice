import { useCallback, useRef, useState } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { Invoice, AleoField } from '@/lib/types';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromInvoiceRecord } from '@/lib/invoice';

const POLL_INTERVAL = 15000; // 15秒

/**
 * Hook: 列表页批量轮询逻辑
 * 
 * 职责：
 * - 批量轮询多个 SENDING 状态的发票
 * - 管理轮询状态和停止条件
 * - 更新 chainStatusMap
 */
export function useInvoiceListPolling(
  invoices: Invoice[],
  chainStatusMap: Map<AleoField, ChainConfirmationStatus>,
  onStatusUpdate: (hash: AleoField, status: ChainConfirmationStatus) => void
) {
  const { masterKey, publicKey } = useUserStore();
  const { updateInvoice } = useInvoiceStore();
  const { scanAllRecords } = useInvoiceChainScan();
  
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sendingHashesRef = useRef<Set<AleoField>>(new Set());

  /**
   * 情况3：轮询同步 SENDING 状态的发票
   */
  const pollSendingInvoices = useCallback(async () => {
    if (!masterKey || !publicKey || sendingHashesRef.current.size === 0) {
      return;
    }

    try {
      // 扫描链上 records
      const chainRecords = await scanAllRecords();
      
      // 检查每个 SENDING 状态的发票
      for (const invoiceHash of sendingHashesRef.current) {
        const chainRecord = chainRecords.get(invoiceHash);
        if (chainRecord) {
          // 找到匹配的 record，同步并移除轮询
          const invoice = invoices.find(inv => inv.invoiceHash === invoiceHash);
          if (invoice) {
            // ✅ 使用公共函数构建更新数据
            const updatedInvoice = updateInvoiceFromInvoiceRecord(invoice, chainRecord);

            await updateInvoice(invoice.id, {
              ...updatedInvoice,
              metadata: {
                confirmationStatus: 'CONFIRMED',
                dataSource: 'chain'
              }
            } as any, {
              masterKey,
              persistFull: true
            });
            
            sendingHashesRef.current.delete(invoiceHash);
            
            // 更新状态
            onStatusUpdate(invoiceHash, 'CONFIRMED');
            
            console.log(`✅ [pollSendingInvoices] Confirmed invoice: ${invoiceHash}`);
          }
        }
      }
      
      // 如果所有发票都已确认，停止轮询
      if (sendingHashesRef.current.size === 0) {
        stopPolling();
      }
    } catch (error) {
      console.error('Failed to poll sending invoices:', error);
    }
  }, [masterKey, publicKey, scanAllRecords, invoices, updateInvoice, onStatusUpdate]);

  /**
   * 开始轮询 SENDING 状态的发票
   */
  const startPolling = useCallback((sendingHashes: AleoField[]) => {
    if (pollingIntervalRef.current) return;
    
    // 添加到轮询列表
    sendingHashes.forEach(hash => sendingHashesRef.current.add(hash));
    
    setIsPolling(true);
    // 立即执行一次
    pollSendingInvoices();
    // 设置定时轮询（每15秒）
    pollingIntervalRef.current = setInterval(pollSendingInvoices, POLL_INTERVAL);
    console.log('🔄 [startPolling] Started polling for SENDING invoices');
  }, [pollSendingInvoices]);

  /**
   * 停止轮询
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setIsPolling(false);
      sendingHashesRef.current.clear();
      console.log('⏹️ [stopPolling] Stopped polling');
    }
  }, []);

  return {
    isPolling,
    startPolling,
    stopPolling
  };
}

