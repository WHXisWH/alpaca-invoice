import { useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { InitializationStatus } from '@/stores/Invoice/InvoiceState';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoInvoiceRecord } from '@/services/CryptoService/ICryptoService';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';
import { createWalletAdapter } from '@/controller/Wallet/useWalletController';
import { Invoice, AleoField } from '@/lib/types';
import { cleanAleoNumber } from '@/lib/utils';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';
import { IInvoiceInitialize } from './IInvoiceInitialize';

const PROGRAM_ID = 'zk_invoice.aleo';

/**
 * useInvoiceInitialize Hook
 * 实现场景A：初始化加载（冷启动）
 * 
 * 流程：
 * 1. 检查masterKey是否存在
 * 2. 如果不存在，需要用户签名授权，然后deriveMasterKey
 * 3. 从链上扫描所有 records 并同步到 Store
 * 4. 从IndexedDB加载加密的发票明细数据
 * 5. 合并链上数据和本地明细，构建完整的发票列表
 */
export function useInvoiceInitialize(): IInvoiceInitialize {
  const wallet = useWallet();
  const { masterKey, publicKey, setMasterKey } = useUserStore();
  const { 
    initStatus, 
    setInitStatus, 
    addInvoice,
    clearInvoices 
  } = useInvoiceStore();
  const { handleError } = useErrorHandler();

  // 使用 useMemo 缓存服务实例，避免每次渲染都创建新实例导致无限循环
  const walletService = useMemo(() => 
    wallet ? new WalletService(createWalletAdapter(wallet)) : null,
    [wallet]
  );
  const cryptoService = useMemo(() => new CryptoService(), []);
  const storageService = useMemo(() => new StorageService(), []);

  /**
   * 请求授权并派生masterKey
   */
  const requestAuthorization = useCallback(async (): Promise<string> => {
    if (!walletService || !publicKey) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet not connected'
      );
    }

    try {
      // 请求签名
      const signature = await walletService.signMessage(
        'Authorize Access',
        publicKey
      );

      if (!signature) {
        throw new WalletServiceError(
          WalletError.USER_REJECTED,
          'Failed to obtain signature for master key generation'
        );
      }

      // 从签名派生主密钥
      const derivedMasterKey = await cryptoService.deriveMasterKey(signature);
      setMasterKey(derivedMasterKey);
      
      return derivedMasterKey;
    } catch (error: any) {
      if (error instanceof WalletServiceError && error.code === WalletError.USER_REJECTED) {
        throw error;
      }
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Failed to generate master key',
        { originalError: error }
      );
    }
  }, [walletService, publicKey, cryptoService, setMasterKey]);

  /**
   * 从链上扫描所有 records
   */
  const scanChainRecords = useCallback(async (): Promise<Map<string, AleoInvoiceRecord>> => {
    const recordsMap = new Map<string, AleoInvoiceRecord>();
    
    if (!walletService || !publicKey) {
      console.log('⚠️ [scanChainRecords] Missing walletService or publicKey');
      return recordsMap;
    }

    try {
      console.log('🔍 [scanChainRecords] Scanning chain for all invoice records...');
      const response = await walletService.requestRecords(PROGRAM_ID);
      const records: any[] = response.records || [];
      console.log(`📋 [scanChainRecords] Found ${records.length} records`);

      // 遍历并解析所有 records
      for (const record of records) {
        try {
          // 解析 Record 数据
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

          // 解析为 AleoInvoiceRecord 格式
          const recordJsonString = typeof recordData === 'string' 
            ? recordData 
            : JSON.stringify(recordData);
          
          const parsedRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(recordJsonString);
          
          // 清理链上哈希的可见性修饰符
          const cleanChainHash = parsedRecord.invoice_hash?.replace(/field\.(private|public)$/, 'field');
          
          if (cleanChainHash) {
            recordsMap.set(cleanChainHash, parsedRecord);
            console.log('✅ [scanChainRecords] Parsed record:', {
              hash: cleanChainHash,
              id: parsedRecord.invoice_id,
              status: parsedRecord.status
            });
          }
        } catch (error) {
          console.warn('Failed to parse record:', error);
          continue;
        }
      }

      console.log(`✅ [scanChainRecords] Successfully parsed ${recordsMap.size} records`);
      return recordsMap;
    } catch (error) {
      console.error('Failed to scan chain records:', error);
      return recordsMap;
    }
  }, [walletService, publicKey, cryptoService]);

  /**
   * 从IndexedDB加载并解密所有发票明细
   * 返回一个 Map<invoiceHash, details>
   */
  const loadDetailsFromDB = useCallback(async (masterKeyValue: string): Promise<Map<string, any>> => {
    const detailsMap = new Map<string, any>();
    
    try {
      // 从IndexedDB获取所有加密的发票
      const encryptedInvoices = await storageService.getAllEncryptedInvoices();
      console.log(`📦 [loadDetailsFromDB] Found ${encryptedInvoices.length} encrypted invoices in IndexedDB`);
      
      // 批量解密
      for (const { invoiceHash, payload } of encryptedInvoices) {
        try {
          const details = await cryptoService.decryptInvoiceDetails(payload, masterKeyValue);
          
          // 验证哈希完整性
          const recomputedHash = await cryptoService.computeInvoiceHash(details);
          
          if (recomputedHash !== invoiceHash) {
            console.warn('⚠️ [loadDetailsFromDB] Hash mismatch for:', invoiceHash);
          } else {
            detailsMap.set(invoiceHash, details);
            console.log('✅ [loadDetailsFromDB] Decrypted details for:', invoiceHash);
          }
        } catch (error) {
          console.error(`Failed to decrypt invoice ${invoiceHash}:`, error);
          // 继续处理其他发票
        }
      }

      return detailsMap;
    } catch (error) {
      console.error('Failed to load details from DB:', error);
      return detailsMap;
    }
  }, [storageService, cryptoService]);

  /**
   * 合并链上数据和本地明细，构建完整的发票列表
   */
  const syncInvoices = useCallback(async (masterKeyValue: string) => {
    try {
      setInitStatus(InitializationStatus.LOADING_DB);
      
      // 1. 从链上扫描所有 records
      console.log('🔄 [syncInvoices] Step 1: Scanning chain records...');
      const chainRecords = await scanChainRecords();
      
      // 2. 从 IndexedDB 加载所有明细
      console.log('🔄 [syncInvoices] Step 2: Loading details from IndexedDB...');
      const localDetails = await loadDetailsFromDB(masterKeyValue);
      
      // 3. 合并数据：优先使用链上数据，补充本地明细
      console.log('🔄 [syncInvoices] Step 3: Merging data...');
      const mergedInvoices: Invoice[] = [];
      
      // 遍历链上所有 records
      for (const [invoiceHash, record] of chainRecords.entries()) {
        try {
          // 清理字段的可见性修饰符
          const cleanInvoiceId = record.invoice_id?.replace(/field\.(private|public)$/, 'field') as AleoField;
          const cleanInvoiceHash = invoiceHash as AleoField;
          
          // 清理数字字段的 Aleo 类型后缀
          const cleanAmount = cleanAleoNumber(record.amount);
          const cleanDueDate = cleanAleoNumber(record.due_date);
          const cleanCreatedAt = cleanAleoNumber(record.created_at);
          const cleanStatus = cleanAleoNumber(record.status);
          
          console.log('🔍 [syncInvoices] Cleaned values for invoice:', {
            hash: cleanInvoiceHash,
            amount: { raw: record.amount, cleaned: cleanAmount },
            dueDate: { raw: record.due_date, cleaned: cleanDueDate },
            createdAt: { raw: record.created_at, cleaned: cleanCreatedAt },
            status: { raw: record.status, cleaned: cleanStatus }
          });
          
          // 从本地获取对应的明细（如果存在）
          const details = localDetails.get(invoiceHash);
          
          // 构建完整的 Invoice 对象
          const invoice: Invoice = {
            id: cleanInvoiceId,
            invoiceHash: cleanInvoiceHash,
            seller: record.seller as any,
            buyer: record.buyer as any,
            amount: BigInt(cleanAmount) as any,
            dueDate: new Date(Number(cleanDueDate) * 1000),
            createdAt: new Date(Number(cleanCreatedAt) * 1000),
            status: Number(cleanStatus) as any,
            details: details || undefined // 如果本地没有明细，设为 undefined
          };
          
          mergedInvoices.push(invoice);
          
          // 设置确认状态为 CONFIRMED（因为已经在链上找到）
          const { setConfirmationStatus } = useInvoiceStore.getState();
          setConfirmationStatus(cleanInvoiceHash, 'CONFIRMED');
        } catch (error) {
          console.error(`❌ [syncInvoices] Failed to process invoice ${invoiceHash}:`, error);
          // 继续处理其他发票，不要让一个发票的错误影响整个流程
          continue;
        }
      }
      
      console.log(`✅ [syncInvoices] Merged ${mergedInvoices.length} invoices`);
      
      // 4. 更新 Store
      clearInvoices();
      mergedInvoices.forEach(invoice => addInvoice(invoice));
      
      setInitStatus(InitializationStatus.READY);
    } catch (error) {
      console.error('Failed to sync invoices:', error);
      handleError(error as Error);
      setInitStatus(InitializationStatus.IDLE);
    }
  }, [scanChainRecords, loadDetailsFromDB, setInitStatus, clearInvoices, addInvoice, handleError]);

  /**
   * 初始化流程
   */
  const initialize = useCallback(async () => {
    if (initStatus === InitializationStatus.READY || initStatus === InitializationStatus.LOADING_DB) {
      return; // 已经初始化或正在初始化
    }

    try {
      // 检查masterKey是否存在
      if (!masterKey) {
        setInitStatus(InitializationStatus.AUTH_REQUIRED);
        return;
      }

      // 同步发票（从链上扫描 + 本地解密）
      await syncInvoices(masterKey);
    } catch (error) {
      handleError(error as Error);
    }
  }, [initStatus, masterKey, syncInvoices, setInitStatus, handleError]);

  /**
   * 处理用户点击解锁
   */
  const handleUnlock = useCallback(async () => {
    try {
      const newMasterKey = await requestAuthorization();
      await syncInvoices(newMasterKey);
    } catch (error) {
      handleError(error as Error);
    }
  }, [requestAuthorization, syncInvoices, handleError]);

  // 自动初始化
  useEffect(() => {
    if (publicKey && wallet?.connected) {
      initialize();
    }
  }, [publicKey, wallet?.connected, initialize]);

  return {
    initStatus,
    initialize,
    handleUnlock,
    isAuthRequired: initStatus === InitializationStatus.AUTH_REQUIRED,
    isLoading: initStatus === InitializationStatus.LOADING_DB,
    isReady: initStatus === InitializationStatus.READY
  };
}

