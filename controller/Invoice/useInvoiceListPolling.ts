import { useCallback, useRef, useState, useMemo } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { Invoice, AleoField } from '@/lib/types';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromInvoiceRecord, updateInvoiceFromPaymentRecord } from '@/lib/invoice';
import { PollingService } from '@/services/PollingService/PollingServiceImpl';
import { createInvoiceValidationAdapter, InvoiceScanResult } from '@/services/PollingService/adapters/InvoiceStatusValidatorAdapter';
import { InvoiceStatusValidator } from '@/services/InvoiceStatusValidator/InvoiceStatusValidatorImpl';

const POLL_INTERVAL = 15000; // 15秒
const POLL_TIMEOUT = 600000; // 10分钟超时

/**
 * Hook: 列表页批量轮询逻辑（改进版）
 * 
 * 职责：
 * - 批量轮询多个 SENDING 状态的发票
 * - 使用 PollingService 和 InvoiceStatusValidator 确保状态验证正确
 * - 为每张发票创建独立的 PollingService 实例
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
  const { scanInvoiceRecord } = useInvoiceChainScan();
  
  // ✅ 使用 InvoiceStatusValidator
  const statusValidator = useMemo(() => new InvoiceStatusValidator(), []);
  
  // ✅ 为每张发票维护独立的 PollingService 实例
  const pollingServicesRef = useRef<Map<AleoField, PollingService<InvoiceScanResult>>>(new Map());
  const [isPolling, setIsPolling] = useState(false);

  /**
   * 确认发票（从链上 record 更新状态）
   */
  const confirmInvoice = useCallback(async (
    invoiceHash: AleoField,
    record: any
  ) => {
    if (!masterKey) return;

    // ✅ 从 store 获取最新的 invoice
    const store = useInvoiceStore.getState();
    const invoice = store.invoices.find(inv => inv.invoiceHash === invoiceHash) || 
                    (store.currentInvoice?.invoiceHash === invoiceHash ? store.currentInvoice : null);
    if (!invoice) return;

    try {
      const isPaymentRecord = 'payment_id' in record;
      let updatedInvoice: Partial<Invoice>;

      if (isPaymentRecord) {
        updatedInvoice = updateInvoiceFromPaymentRecord(invoice, record);
      } else {
        updatedInvoice = updateInvoiceFromInvoiceRecord(invoice, record);
      }

      await updateInvoice(invoice.id, {
        ...updatedInvoice,
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain',
          action: invoice.metadata?.action
        }
      } as any, {
        masterKey,
        persistFull: true
      });

      onStatusUpdate(invoiceHash, 'CONFIRMED');
      console.log(`✅ [confirmInvoice] Confirmed invoice: ${invoiceHash}`);
    } catch (error) {
      console.error(`❌ [confirmInvoice] Failed to confirm invoice ${invoiceHash}:`, error);
    }
  }, [masterKey, updateInvoice, onStatusUpdate]);

  /**
   * 回退状态（超时或失败时）
   */
  const rollbackStatus = useCallback(async (invoiceHash: AleoField) => {
    if (!masterKey) return;

    // ✅ 从 store 获取最新的 invoice
    const store = useInvoiceStore.getState();
    const invoice = store.invoices.find(inv => inv.invoiceHash === invoiceHash) || 
                    (store.currentInvoice?.invoiceHash === invoiceHash ? store.currentInvoice : null);
    if (!invoice) return;

    try {
      await updateInvoice(invoice.id, {
        metadata: {
          confirmationStatus: 'CONFIRMED',
          dataSource: 'chain',
          action: invoice.metadata?.action
        }
      } as any, {
        masterKey,
        persistFull: true
      });

      onStatusUpdate(invoiceHash, 'CONFIRMED');
      console.log(`⚠️ [rollbackStatus] Rolled back invoice: ${invoiceHash}`);
    } catch (error) {
      console.error(`❌ [rollbackStatus] Failed to rollback invoice ${invoiceHash}:`, error);
    }
  }, [masterKey, updateInvoice, onStatusUpdate]);

  /**
   * 为单张发票启动轮询
   */
  const startPollingForInvoice = useCallback((invoiceHash: AleoField) => {
    // 如果已经在轮询，跳过
    if (pollingServicesRef.current.has(invoiceHash)) {
      console.log(`⏭️ [startPollingForInvoice] Already polling: ${invoiceHash}`);
      return;
    }

    // ✅ 从 store 获取最新的 invoice（确保获取到最新的 metadata，包括 action）
    const store = useInvoiceStore.getState();
    const invoice = store.invoices.find(inv => inv.invoiceHash === invoiceHash) || 
                    (store.currentInvoice?.invoiceHash === invoiceHash ? store.currentInvoice : null);
    
    if (!invoice || !masterKey || !publicKey) {
      console.warn(`⚠️ [startPollingForInvoice] Missing data for: ${invoiceHash}`, {
        hasInvoice: !!invoice,
        hasMasterKey: !!masterKey,
        hasPublicKey: !!publicKey,
        invoiceAction: invoice?.metadata?.action
      });
      return;
    }

    console.log(`🔄 [startPollingForInvoice] Starting polling for: ${invoiceHash}`, {
      action: invoice.metadata?.action,
      status: invoice.status,
      confirmationStatus: invoice.metadata?.confirmationStatus
    });

    // ✅ 创建验证函数，每次验证时都从 store 获取最新的 invoice
    const validateWithLatestInvoice = (result: InvoiceScanResult) => {
      // ✅ 每次验证时都从 store 获取最新的 invoice
      const latestStore = useInvoiceStore.getState();
      const latestInvoice = latestStore.invoices.find(inv => inv.invoiceHash === invoiceHash) || 
                           (latestStore.currentInvoice?.invoiceHash === invoiceHash ? latestStore.currentInvoice : null);
      
      if (!latestInvoice) {
        console.warn(`⚠️ [validateWithLatestInvoice] Invoice not found: ${invoiceHash}`);
        return {
          shouldStop: false,
          reason: 'Invoice not found',
          shouldContinue: false
        };
      }
      
      // ✅ 使用最新的 invoice 创建验证适配器
      const validateAdapter = createInvoiceValidationAdapter(statusValidator, latestInvoice);
      return validateAdapter(result);
    };

    // 创建并启动 PollingService
    const pollingService = new PollingService<InvoiceScanResult>(
      {
        pollInterval: POLL_INTERVAL,
        pollTimeout: POLL_TIMEOUT,
        taskName: `Invoice polling (${invoiceHash.slice(0, 20)}...)`
      },
      {
        scan: async () => {
          // ✅ 每次扫描时也从 store 获取最新的 invoice.id（以防 id 变化）
          const latestStore = useInvoiceStore.getState();
          const latestInvoice = latestStore.invoices.find(inv => inv.invoiceHash === invoiceHash) || 
                               (latestStore.currentInvoice?.invoiceHash === invoiceHash ? latestStore.currentInvoice : null);
          const invoiceId = latestInvoice?.id || invoice.id;
          
          const result = await scanInvoiceRecord(invoiceHash, invoiceId);
          return {
            invoiceRecord: result.invoiceRecord,
            paymentRecord: result.paymentRecord
          };
        },
        validate: validateWithLatestInvoice,
        onSuccess: async (result) => {
          const recordToUse = result.paymentRecord || result.invoiceRecord;
          if (recordToUse) {
            await confirmInvoice(invoiceHash, recordToUse);
          }
          // 停止并移除轮询服务
          pollingServicesRef.current.delete(invoiceHash);
          if (pollingServicesRef.current.size === 0) {
            setIsPolling(false);
          }
        },
        onTimeout: async () => {
          await rollbackStatus(invoiceHash);
          pollingServicesRef.current.delete(invoiceHash);
          if (pollingServicesRef.current.size === 0) {
            setIsPolling(false);
          }
        },
        onError: (error) => {
          console.error(`[startPollingForInvoice] Polling error for ${invoiceHash}:`, error);
          // 错误时不停止轮询，继续尝试
        }
      }
    );

    pollingService.start();
    pollingServicesRef.current.set(invoiceHash, pollingService);
    setIsPolling(true);
  }, [masterKey, publicKey, scanInvoiceRecord, statusValidator, confirmInvoice, rollbackStatus]);

  /**
   * 开始轮询 SENDING 状态的发票
   */
  const startPolling = useCallback((sendingHashes: AleoField[]) => {
    sendingHashes.forEach(hash => {
      startPollingForInvoice(hash);
    });
  }, [startPollingForInvoice]);

  /**
   * 停止轮询
   */
  const stopPolling = useCallback(() => {
    pollingServicesRef.current.forEach((service, hash) => {
      service.stop();
    });
    pollingServicesRef.current.clear();
    setIsPolling(false);
    console.log('⏹️ [stopPolling] Stopped all polling services');
  }, []);

  /**
   * 停止特定发票的轮询
   */
  const stopPollingForInvoice = useCallback((invoiceHash: AleoField) => {
    const service = pollingServicesRef.current.get(invoiceHash);
    if (service) {
      service.stop();
      pollingServicesRef.current.delete(invoiceHash);
      if (pollingServicesRef.current.size === 0) {
        setIsPolling(false);
      }
    }
  }, []);

  return {
    isPolling,
    startPolling,
    stopPolling,
    stopPollingForInvoice
  };
}

