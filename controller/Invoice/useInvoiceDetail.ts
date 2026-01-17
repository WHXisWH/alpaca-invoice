import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';
import { createWalletAdapter } from '@/controller/Wallet/useWalletController';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { AleoField, Invoice, InvoiceStatus } from '@/lib/types';
import { cleanAleoNumber } from '@/lib/utils';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { IInvoiceDetail, UserRole, StatusConfig } from './IInvoiceDetail';
import { toast } from 'sonner';

const POLL_INTERVAL = 15000; // 15秒
const PROGRAM_ID = 'zk_invoice.aleo';

/**
 * useInvoiceDetail Hook
 * 实现场景B & C：查看详情与Record自动对账
 * 
 * 流程：
 * 1. 从URL获取hash
 * 2. 从Store获取发票（可能状态是'SENDING'）
 * 3. 如果状态不是'CONFIRMED'，开始轮询扫描Record
 * 4. 每15秒扫描一次，查找匹配的Record
 * 5. 如果找到匹配的Record，更新状态为'CONFIRMED'并同步到IndexedDB
 * 6. 停止轮询
 */
export function useInvoiceDetail(invoiceHash: AleoField | null): IInvoiceDetail {
  const wallet = useWallet();
  const { masterKey, publicKey } = useUserStore();
  const { 
    getInvoiceByHash,
    updateInvoice,
    setConfirmationStatus,
    confirmationStatus
  } = useNewInvoiceStore();
  const { handleError } = useErrorHandler();
  
  // 使用 Transaction Controller
  const { executePay, executeCancel } = useTransactionController();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncingStatus, setIsSyncingStatus] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 使用 useMemo 缓存服务实例，避免每次渲染都创建新实例导致无限循环
  const walletService = useMemo(() => new WalletService(createWalletAdapter(wallet)), [wallet]);
  const cryptoService = useMemo(() => new CryptoService(), []);
  const storageService = useMemo(() => new StorageService(), []);

  /**
   * 获取发票对象
   */
  const invoice = invoiceHash ? getInvoiceByHash(invoiceHash) : null;
  
  /**
   * 获取当前确认状态 - 使用 useMemo 确保响应式更新
   */
  const currentStatus: ChainConfirmationStatus = useMemo(() => {
    if (!invoiceHash) return 'SENDING';
    return confirmationStatus.get(invoiceHash) || 'SENDING';
  }, [invoiceHash, confirmationStatus]);

  /**
   * 确定当前用户的角色（卖家或买家）
   */
  const userRole: UserRole = useMemo(() => {
    if (!publicKey || !invoice) return 'unknown';
    
    // 清理地址字符串，移除可能的可见性修饰符
    const cleanPublicKey = publicKey.replace(/\.(private|public)$/, '');
    const cleanSeller = invoice.seller.replace(/\.(private|public)$/, '');
    const cleanBuyer = invoice.buyer.replace(/\.(private|public)$/, '');
    
    if (cleanPublicKey === cleanSeller) {
      return 'seller';
    } else if (cleanPublicKey === cleanBuyer) {
      return 'buyer';
    }
    
    return 'unknown';
  }, [publicKey, invoice]);

  /**
   * 获取状态配置
   */
  const getStatusConfig = useCallback((status: InvoiceStatus): StatusConfig => {
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
  }, []);

  /**
   * 当前状态配置
   */
  const statusConfig: StatusConfig = useMemo(() => {
    return invoice ? getStatusConfig(invoice.status) : getStatusConfig(InvoiceStatus.PENDING);
  }, [invoice, getStatusConfig]);

  /**
   * 手动同步发票状态（从链上获取最新 record）
   * 根据 invoice_id 查找最新的 record（InvoiceRecord 或 PaymentRecord）
   */
  const handleSyncStatus = useCallback(async () => {
    if (!invoice || !invoiceHash || !masterKey || !publicKey) {
      toast.error('Unable to sync', {
        description: 'Missing required data'
      });
      return;
    }

    setIsSyncingStatus(true);
    try {
      console.log('🔄 [handleSyncStatus] Starting manual sync for invoice:', invoice.id);
      toast.loading('Syncing status...', { id: 'sync-status' });

      // Scan all records from chain
      const response = await walletService.requestRecords(PROGRAM_ID);
      const records: any[] = response.records || [];
      console.log(`📋 [handleSyncStatus] Found ${records.length} records on chain`);

      let latestInvoiceRecord: AleoInvoiceRecord | null = null;
      let latestPaymentRecord: AleoPaymentRecord | null = null;

      // Iterate through all records to find the latest record matching invoice_id
      for (const record of records) {
        try {
          // Parse Record data
          let recordData: any;
          
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
            continue;
          }
          
          if (!recordData) continue;

          // Parse to common format
          const recordJsonString = typeof recordData === 'string' 
            ? recordData 
            : JSON.stringify(recordData);
          
          const parsedRecord = await cryptoService.parseAleoRecord<any>(recordJsonString);
          
          // Determine if it's InvoiceRecord or PaymentRecord
          // PaymentRecord has payment_id field, InvoiceRecord has invoice_hash field
          const isPaymentRecord = 'payment_id' in parsedRecord && parsedRecord.payment_id;
          const isInvoiceRecord = 'invoice_hash' in parsedRecord && parsedRecord.invoice_hash;
          
          if (isPaymentRecord) {
            // PaymentRecord
            const cleanRecordInvoiceId = parsedRecord.invoice_id?.replace(/field\.(private|public)$/, 'field');
            const cleanCurrentInvoiceId = invoice.id?.replace(/field\.(private|public)$/, 'field');
            
            console.log('🔍 [handleSyncStatus] Comparing PaymentRecord invoice_id:', {
              recordInvoiceId: cleanRecordInvoiceId,
              currentInvoiceId: cleanCurrentInvoiceId,
              match: cleanRecordInvoiceId === cleanCurrentInvoiceId
            });

            if (cleanRecordInvoiceId === cleanCurrentInvoiceId) {
              console.log('✅ [handleSyncStatus] Found matching PaymentRecord:', parsedRecord);
              latestPaymentRecord = parsedRecord as AleoPaymentRecord;
              // PaymentRecord takes priority, break when found
              break;
            }
          } else if (isInvoiceRecord) {
            // InvoiceRecord
            const cleanRecordInvoiceId = parsedRecord.invoice_id?.replace(/field\.(private|public)$/, 'field');
            const cleanCurrentInvoiceId = invoice.id?.replace(/field\.(private|public)$/, 'field');
            
            console.log('🔍 [handleSyncStatus] Comparing InvoiceRecord invoice_id:', {
              recordInvoiceId: cleanRecordInvoiceId,
              currentInvoiceId: cleanCurrentInvoiceId,
              match: cleanRecordInvoiceId === cleanCurrentInvoiceId
            });

            if (cleanRecordInvoiceId === cleanCurrentInvoiceId) {
              console.log('✅ [handleSyncStatus] Found matching InvoiceRecord:', parsedRecord);
              latestInvoiceRecord = parsedRecord as AleoInvoiceRecord;
            }
          }
        } catch (error) {
          console.warn('Failed to parse record:', error);
          continue;
        }
      }

      // Use PaymentRecord first, if not available then use InvoiceRecord
      const recordToUse = latestPaymentRecord || latestInvoiceRecord;
      const recordType = latestPaymentRecord ? 'payment' : 'invoice';

      if (!recordToUse) {
        toast.error('No matching on-chain record found', { id: 'sync-status' });
        return;
      }

      console.log(`🔄 [handleSyncStatus] Updating with ${recordType} record`);

      // Build update data based on different record types
      let updatedInvoice: Partial<Invoice>;

      if (latestPaymentRecord) {
        // Build update data from PaymentRecord
        const cleanInvoiceId = latestPaymentRecord.invoice_id?.replace(/field\.(private|public)$/, 'field') as AleoField;
        const cleanAmount = cleanAleoNumber(latestPaymentRecord.amount);
        const cleanPaidAt = cleanAleoNumber(latestPaymentRecord.paid_at);

        updatedInvoice = {
          id: cleanInvoiceId,
          invoiceHash: invoice.invoiceHash, // Keep original hash
          seller: latestPaymentRecord.payee as any, // PaymentRecord's payee is the seller
          buyer: latestPaymentRecord.payer as any,  // PaymentRecord's payer is the buyer
          amount: BigInt(cleanAmount) as any,
          dueDate: invoice.dueDate, // Keep original due date
          createdAt: invoice.createdAt, // Keep original created at
          status: 1 as any // PaymentRecord indicates paid, status = 1 (PAID)
        };

        console.log('✅ [handleSyncStatus] Updated from PaymentRecord - Status: PAID');
      } else if (latestInvoiceRecord) {
        // Build update data from InvoiceRecord
        const cleanInvoiceId = latestInvoiceRecord.invoice_id?.replace(/field\.(private|public)$/, 'field') as AleoField;
        const cleanAmount = cleanAleoNumber(latestInvoiceRecord.amount);
        const cleanDueDate = cleanAleoNumber(latestInvoiceRecord.due_date);
        const cleanCreatedAt = cleanAleoNumber(latestInvoiceRecord.created_at);
        const cleanStatus = cleanAleoNumber(latestInvoiceRecord.status);

        updatedInvoice = {
          id: cleanInvoiceId,
          invoiceHash: invoice.invoiceHash, // Keep original hash - DO NOT UPDATE
          seller: latestInvoiceRecord.seller as any,
          buyer: latestInvoiceRecord.buyer as any,
          amount: BigInt(cleanAmount) as any,
          dueDate: new Date(Number(cleanDueDate) * 1000),
          createdAt: new Date(Number(cleanCreatedAt) * 1000),
          status: Number(cleanStatus) as any
        };

        console.log(`✅ [handleSyncStatus] Updated from InvoiceRecord - Status: ${getStatusLabel(Number(cleanStatus))}`);
      } else {
        toast.error('Invalid record type', { id: 'sync-status' });
        return;
      }
      
      // Update Store
      updateInvoice(invoice.id, updatedInvoice);
      setConfirmationStatus(invoiceHash, 'CONFIRMED');

      // Sync update IndexedDB (keep details unchanged)
      if (invoice.details) {
        const encryptedPayload = await cryptoService.encryptInvoiceDetails(
          invoice.details,
          masterKey
        );
        await storageService.saveEncryptedInvoice(invoiceHash, encryptedPayload);
      }

      toast.success('Status sync successful', {
        id: 'sync-status',
        description: recordType === 'payment' 
          ? '✅ Paid (Payment Record)' 
          : `${getStatusLabel(updatedInvoice.status as number)}`
      });

      console.log('✅ [handleSyncStatus] Sync completed successfully');
    } catch (error) {
      console.error('Failed to sync status:', error);
      toast.error('Sync failed', {
        id: 'sync-status',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      handleError(error as Error);
    } finally {
      setIsSyncingStatus(false);
    }
  }, [invoice, invoiceHash, masterKey, publicKey, walletService, cryptoService, storageService, updateInvoice, setConfirmationStatus, handleError]);

  /**
   * 获取状态标签
   */
  const getStatusLabel = useCallback((status: number): string => {
    switch (status) {
      case 0: return 'Pending';
      case 1: return 'Paid';
      case 2: return 'Cancelled';
      case 3: return 'Expired';
      default: return 'Unknown';
    }
  }, []);

  /**
   * 处理支付
   * 使用 TransactionController 的 executePay
   */
  const handlePay = useCallback(async () => {
    if (!invoice?.id) return;
    
    setIsProcessing(true);
    try {
      toast.loading('Processing payment...', { id: 'pay-invoice' });
      const transactionId = await executePay(invoice.id);
      toast.success('Payment successful!', {
        id: 'pay-invoice',
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      // Trigger sync to update invoice status
      await handleSyncStatus();
    } catch (error) {
      toast.error('Payment failed', {
        id: 'pay-invoice',
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [invoice, executePay, handleSyncStatus, handleError]);

  /**
   * 处理取消
   * 使用 TransactionController 的 executeCancel
   */
  const handleCancel = useCallback(async () => {
    if (!invoice?.id) return;
    
    setIsProcessing(true);
    try {
      toast.loading('Cancelling invoice...', { id: 'cancel-invoice' });
      const transactionId = await executeCancel(invoice.id);
      toast.success('Invoice cancelled successfully', { 
        id: 'cancel-invoice',
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      // Trigger sync to update invoice status
      await handleSyncStatus();
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: 'cancel-invoice',
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [invoice, executeCancel, handleSyncStatus, handleError]);

  /**
   * 扫描链上Record，查找匹配的发票
   */
  const scanChainRecords = useCallback(async (): Promise<AleoInvoiceRecord | null> => {
    if (!publicKey || !invoiceHash) {
      console.log('⚠️ [scanChainRecords] Missing publicKey or invoiceHash', { publicKey, invoiceHash });
      return null;
    }

    try {
      console.log('🔍 [scanChainRecords] Scanning for invoice:', invoiceHash);
      // 使用 walletService 封装的 requestRecords 方法
      const response = await walletService.requestRecords(PROGRAM_ID);
      const records: any[] = response.records || [];
      console.log(`📋 [scanChainRecords] Found ${records.length} records`);

      // 遍历Records，查找匹配的发票
      for (const record of records) {
        try {
          // 解析Record数据
          // walletService.requestRecords返回的record可能是：
          // 1. 字符串格式（需要JSON.parse）
          // 2. 对象格式，包含data字段
          // 3. 已经是解析后的对象
          let recordData: any;
          
          if (typeof record === 'string') {
            recordData = JSON.parse(record);
          } else if (record && typeof record === 'object') {
            // 如果record有data字段，使用data字段
            if (record.data) {
              recordData = typeof record.data === 'string' 
                ? JSON.parse(record.data) 
                : record.data;
            } else {
              // 直接使用record对象
              recordData = record;
            }
          } else {
            continue;
          }
          
          if (!recordData) continue;

          // 解析为AleoInvoiceRecord格式
          const recordJsonString = typeof recordData === 'string' 
            ? recordData 
            : JSON.stringify(recordData);
          
          const parsedRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(recordJsonString);
          
          // 清理链上哈希的可见性修饰符（双重保险）
          const cleanChainHash = parsedRecord.invoice_hash?.replace(/field\.(private|public)$/, 'field');
          
          // 调试日志：对比链上哈希和本地哈希
          console.log('🔍 [scanChainRecords] Comparing:', {
            recordHash: parsedRecord.invoice_hash,
            cleanedHash: cleanChainHash,
            invoiceHash: invoiceHash,
            match: cleanChainHash === invoiceHash
          });
          console.log('🔍 [VERIFY] Chain invoice_hash (original):', parsedRecord.invoice_hash);
          console.log('🔍 [VERIFY] Chain invoice_hash (cleaned):', cleanChainHash);
          console.log('🔍 [VERIFY] Expected hash:', invoiceHash);
          console.log('🔍 [VERIFY] Hash lengths:', {
            chain: parsedRecord.invoice_hash?.length,
            cleaned: cleanChainHash?.length,
            expected: invoiceHash?.length
          });

          // 检查是否匹配（通过invoice_hash匹配，使用清理后的哈希）
          if (cleanChainHash === invoiceHash) {
            console.log('✅ Found matching record on chain:', parsedRecord);
            return parsedRecord;
          }
        } catch (error) {
          console.warn('Failed to parse record:', error);
          continue;
        }
      }

      console.log('❌ [scanChainRecords] No matching record found');
      return null;
    } catch (error) {
      console.error('Failed to scan chain records:', error);
      return null;
    }
  }, [walletService, publicKey, invoiceHash, cryptoService]);

  /**
   * 更新发票状态为已确认，并同步到IndexedDB
   */
  const confirmInvoice = useCallback(async (record: AleoInvoiceRecord) => {
    if (!invoiceHash || !invoice || !masterKey) {
      console.warn('⚠️ [confirmInvoice] Missing required data', { invoiceHash, invoice: !!invoice, masterKey: !!masterKey });
      return;
    }

    try {
      console.log('🔄 [confirmInvoice] Confirming invoice:', invoiceHash);
      console.log('🔍 [confirmInvoice] Raw record data:', record);
      
      // 清理链上哈希的可见性修饰符
      const cleanInvoiceId = record.invoice_id?.replace(/field\.(private|public)$/, 'field') as AleoField;
      
      // 清理数字字段的 Aleo 类型后缀
      const cleanAmount = cleanAleoNumber(record.amount);
      const cleanDueDate = cleanAleoNumber(record.due_date);
      const cleanCreatedAt = cleanAleoNumber(record.created_at);
      const cleanStatus = cleanAleoNumber(record.status);
      
      console.log('🔍 [confirmInvoice] Cleaned values:', {
        amount: { raw: record.amount, cleaned: cleanAmount },
        dueDate: { raw: record.due_date, cleaned: cleanDueDate },
        createdAt: { raw: record.created_at, cleaned: cleanCreatedAt },
        status: { raw: record.status, cleaned: cleanStatus }
      });
      
      // 更新Store中的确认状态
      setConfirmationStatus(invoiceHash, 'CONFIRMED');

      // 从链上Record更新Invoice对象的所有字段（包括最新的invoiceId）
      const updatedInvoice: Partial<Invoice> = {
        id: cleanInvoiceId,
        invoiceHash: invoice.invoiceHash, // Keep original hash - DO NOT UPDATE
        seller: record.seller as any,
        buyer: record.buyer as any,
        amount: BigInt(cleanAmount) as any,
        dueDate: new Date(Number(cleanDueDate) * 1000),
        createdAt: new Date(Number(cleanCreatedAt) * 1000),
        status: Number(cleanStatus) as any
      };
      
      // 使用原来的invoice.id来更新，因为这是store中的key
      updateInvoice(invoice.id, updatedInvoice);

      // 同步更新本地持久化存档（使用invoiceHash作为key，保持details不变）
      if (invoice.details) {
        const encryptedPayload = await cryptoService.encryptInvoiceDetails(
          invoice.details,
          masterKey
        );
        // IndexedDB使用invoiceHash作为主键
        await storageService.saveEncryptedInvoice(invoiceHash, encryptedPayload);
      }

      console.log('✅ Invoice confirmed and synced to IndexedDB', {
        invoiceHash,
        invoiceId: cleanInvoiceId,
        status: record.status,
        seller: record.seller,
        buyer: record.buyer
      });
    } catch (error) {
      console.error('Failed to confirm invoice:', error);
      handleError(error as Error);
    }
  }, [invoiceHash, invoice, masterKey, setConfirmationStatus, updateInvoice, cryptoService, storageService, handleError]);

  /**
   * 停止轮询
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setIsSyncing(false);
      console.log('⏹️ Stopped polling chain records');
    }
  }, []);

  /**
   * 开始轮询扫描
   */
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      return; // 已经在轮询
    }

    if (!invoiceHash || currentStatus === 'CONFIRMED') {
      console.log('⏭️ [startPolling] Skipping - already confirmed or no hash', { invoiceHash, currentStatus });
      return; // 不需要轮询
    }

    setIsSyncing(true);
    console.log('🔄 Starting to poll chain records for invoice:', invoiceHash);

    // 立即执行一次扫描
    scanChainRecords().then((record) => {
      if (record) {
        confirmInvoice(record).then(() => {
          stopPolling();
        });
      }
    });

    // 设置定时轮询
    pollingIntervalRef.current = setInterval(async () => {
      const record = await scanChainRecords();
      if (record) {
        await confirmInvoice(record);
        stopPolling();
      }
    }, POLL_INTERVAL);
  }, [invoiceHash, currentStatus, scanChainRecords, confirmInvoice, stopPolling]);

  /**
   * 自动开始/停止轮询
   */
  useEffect(() => {
    console.log('🔄 [useEffect] Status changed:', { invoiceHash, currentStatus });
    if (invoiceHash && currentStatus !== 'CONFIRMED') {
      startPolling();
    } else {
      stopPolling();
    }

    // 清理函数
    return () => {
      stopPolling();
    };
  }, [invoiceHash, currentStatus, startPolling, stopPolling]);

  return {
    invoice,
    currentStatus,
    isSyncing,
    isConfirmed: currentStatus === 'CONFIRMED',
    userRole,
    statusConfig,
    isProcessing,
    isSyncingStatus,
    handlePay,
    handleCancel,
    handleSyncStatus,
    startPolling,
    stopPolling
  };
}

