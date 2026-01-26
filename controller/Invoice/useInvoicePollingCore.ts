import { useCallback, useMemo } from 'react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { AleoField, Invoice } from '@/lib/types';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromInvoiceRecord, updateInvoiceFromPaymentRecord } from '@/lib/invoice';
import { PollingService } from '@/services/PollingService/PollingServiceImpl';
import { createInvoiceValidationAdapter, InvoiceScanResult } from '@/services/PollingService/adapters/InvoiceStatusValidatorAdapter';
import { InvoiceStatusValidator } from '@/services/InvoiceStatusValidator/InvoiceStatusValidatorImpl';

const POLL_INTERVAL = 15000; // 15秒
const POLL_TIMEOUT = 600000; // 10分钟超时

/**
 * 轮询完成回调接口
 */
export interface PollingCallbacks {
  /** 轮询成功回调 */
  onSuccess: (updatedInvoice: Invoice, record: AleoInvoiceRecord | AleoPaymentRecord) => void | Promise<void>;
  /** 轮询超时回调 */
  onTimeout: (rolledBackInvoice: Invoice) => void | Promise<void>;
  /** 轮询错误回调（可选） */
  onError?: (error: Error) => void;
}

/**
 * Hook: 核心轮询逻辑
 * 
 * 职责：
 * - 封装单个发票的轮询逻辑
 * - 处理扫描、验证、确认的通用流程
 * - 通过回调提供灵活的处理方式
 * - 被 useInvoiceListPolling 和 useInvoiceChainSync 复用
 */
export function useInvoicePollingCore() {
  const { scanInvoiceRecord } = useInvoiceChainScan();
  const statusValidator = useMemo(() => new InvoiceStatusValidator(), []);

  /**
   * 从 store 获取最新的 invoice
   */
  const getLatestInvoice = useCallback((invoiceHash: AleoField): Invoice | null => {
    const store = useInvoiceStore.getState();
    return store.invoices.find(inv => inv.invoiceHash === invoiceHash) || 
           (store.currentInvoice?.invoiceHash === invoiceHash ? store.currentInvoice : null);
  }, []);

  /**
   * 构建更新后的 Invoice
   */
  const buildUpdatedInvoice = useCallback((
    invoice: Invoice,
    record: AleoInvoiceRecord | AleoPaymentRecord
  ): Invoice => {
    const isPaymentRecord = 'payment_id' in record;
    let updatedFields: Partial<Invoice>;

    if (isPaymentRecord) {
      updatedFields = updateInvoiceFromPaymentRecord(invoice, record as AleoPaymentRecord);
    } else {
      updatedFields = updateInvoiceFromInvoiceRecord(invoice, record as AleoInvoiceRecord);
    }

    return {
      ...invoice,
      ...updatedFields,
      metadata: {
        confirmationStatus: 'CONFIRMED',
        dataSource: 'chain',
        lastUpdated: new Date(),
        action: invoice.metadata?.action
      }
    };
  }, []);

  /**
   * 构建回退后的 Invoice（超时时使用）
   */
  const buildRolledBackInvoice = useCallback((invoice: Invoice): Invoice => {
    return {
      ...invoice,
      metadata: {
        confirmationStatus: 'CONFIRMED',
        dataSource: 'chain',
        lastUpdated: new Date(),
        action: invoice.metadata?.action
      }
    };
  }, []);

  /**
   * 创建单个发票的 PollingService
   * 
   * @param invoiceHash - 发票 hash
   * @param invoice - 初始 invoice 对象
   * @param callbacks - 回调函数
   * @returns PollingService 实例
   */
  const createPollingService = useCallback((
    invoiceHash: AleoField,
    invoice: Invoice,
    callbacks: PollingCallbacks
  ): PollingService<InvoiceScanResult> => {
    console.log(`🔄 [PollingCore] Creating polling service for: ${invoiceHash}`, {
      action: invoice.metadata?.action,
      status: invoice.status,
      confirmationStatus: invoice.metadata?.confirmationStatus
    });

    // 创建 PollingService
    return new PollingService<InvoiceScanResult>(
      {
        pollInterval: POLL_INTERVAL,
        pollTimeout: POLL_TIMEOUT,
        taskName: `Invoice polling (${invoiceHash.slice(0, 20)}...)`
      },
      {
        // 扫描函数：每次都从 store 获取最新的 invoice
        scan: async () => {
          const latestInvoice = getLatestInvoice(invoiceHash);
          const invoiceId = latestInvoice?.id || invoice.id;
          
          const result = await scanInvoiceRecord(invoiceHash, invoiceId);
          return {
            invoiceRecord: result.invoiceRecord,
            paymentRecord: result.paymentRecord
          };
        },
        
        // 验证函数：每次都从 store 获取最新的 invoice 进行验证
        validate: (result) => {
          const latestInvoice = getLatestInvoice(invoiceHash);
          
          if (!latestInvoice) {
            console.warn(`⚠️ [PollingCore] Invoice not found during validation: ${invoiceHash}`);
            return {
              shouldStop: false,
              reason: 'Invoice not found',
              shouldContinue: false
            };
          }
          
          // 使用最新的 invoice 创建验证适配器
          const validateAdapter = createInvoiceValidationAdapter(statusValidator, latestInvoice);
          return validateAdapter(result);
        },
        
        // 成功回调
        onSuccess: async (result) => {
          const recordToUse = result.paymentRecord || result.invoiceRecord;
          if (recordToUse) {
            // 从 store 获取最新的 invoice 用于构建更新
            const latestInvoice = getLatestInvoice(invoiceHash) || invoice;
            const updatedInvoice = buildUpdatedInvoice(latestInvoice, recordToUse);
            
            console.log(`✅ [PollingCore] Polling succeeded for: ${invoiceHash}`);
            await callbacks.onSuccess(updatedInvoice, recordToUse);
          }
        },
        
        // 超时回调
        onTimeout: async () => {
          // 从 store 获取最新的 invoice 用于构建回退
          const latestInvoice = getLatestInvoice(invoiceHash) || invoice;
          const rolledBackInvoice = buildRolledBackInvoice(latestInvoice);
          
          console.log(`⚠️ [PollingCore] Polling timeout for: ${invoiceHash}`);
          await callbacks.onTimeout(rolledBackInvoice);
        },
        
        // 错误回调
        onError: callbacks.onError || ((error) => {
          console.error(`❌ [PollingCore] Polling error for ${invoiceHash}:`, error);
        })
      }
    );
  }, [scanInvoiceRecord, statusValidator, getLatestInvoice, buildUpdatedInvoice, buildRolledBackInvoice]);

  return {
    createPollingService,
    getLatestInvoice,
    buildUpdatedInvoice,
    buildRolledBackInvoice
  };
}
