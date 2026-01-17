import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoInvoiceRecord } from '@/services/CryptoService/ICryptoService';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';
import { createWalletAdapter } from '@/controller/Wallet/useWalletController';
import { AleoField, Invoice } from '@/lib/types';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { IInvoiceDetail } from './IInvoiceDetail';

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
  } = useInvoiceStore();
  const { handleError } = useErrorHandler();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 创建服务实例
  const walletService = new WalletService(createWalletAdapter(wallet));
  const cryptoService = new CryptoService();
  const storageService = new StorageService();

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
      console.log('records', records)

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
      // 更新Store中的确认状态
      setConfirmationStatus(invoiceHash, 'CONFIRMED');

      // 从链上Record更新Invoice对象的所有字段
      const updatedInvoice: Partial<Invoice> = {
        id: record.invoice_id as AleoField,
        invoiceHash: record.invoice_hash as AleoField,
        seller: record.seller as any,
        buyer: record.buyer as any,
        amount: BigInt(record.amount) as any,
        dueDate: new Date(record.due_date * 1000),
        createdAt: new Date(record.created_at * 1000),
        status: record.status as any
      };
      updateInvoice(invoice.id, updatedInvoice);

      // 同步更新本地持久化存档（保持details不变）
      if (invoice.details) {
        const encryptedPayload = await cryptoService.encryptInvoiceDetails(
          invoice.details,
          masterKey
        );
        await storageService.saveEncryptedInvoice(invoiceHash, encryptedPayload);
      }

      console.log('✅ Invoice confirmed and synced to IndexedDB', {
        invoiceHash,
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
    startPolling,
    stopPolling
  };
}

