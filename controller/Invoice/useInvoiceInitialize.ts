import { useEffect, useCallback } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { InitializationStatus } from '@/stores/Invoice/InvoiceState';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';
import { createWalletAdapter } from '@/controller/Wallet/useWalletController';
import { Invoice, AleoField } from '@/lib/types';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';
import { IInvoiceInitialize } from './IInvoiceInitialize';

/**
 * useInvoiceInitialize Hook
 * 实现场景A：初始化加载（冷启动）
 * 
 * 流程：
 * 1. 检查masterKey是否存在
 * 2. 如果不存在，需要用户签名授权，然后deriveMasterKey
 * 3. 从IndexedDB加载加密的发票数据
 * 4. 批量解密并加载到Store
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

  // 创建服务实例
  const walletService = wallet ? new WalletService(createWalletAdapter(wallet)) : null;
  const cryptoService = new CryptoService();
  const storageService = new StorageService();

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
   * 从IndexedDB加载并解密所有发票
   */
  const loadInvoicesFromDB = useCallback(async (masterKeyValue: string) => {
    try {
      setInitStatus(InitializationStatus.LOADING_DB);
      
      // 从IndexedDB获取所有加密的发票
      const encryptedInvoices = await storageService.getAllEncryptedInvoices();
      
      // 如果没有发票，直接设置为 READY
      if (encryptedInvoices.length === 0) {
        clearInvoices();
        setInitStatus(InitializationStatus.READY);
        return;
      }
      
      // 批量解密
      const decryptedInvoices: Invoice[] = [];
      for (const { invoiceHash, payload } of encryptedInvoices) {
        try {
          const details = await cryptoService.decryptInvoiceDetails(payload, masterKeyValue);
          
          // 调试日志：验证解密后的数据哈希是否与原始哈希匹配
          console.log('🔍 [DECRYPT] Decrypted details for hash:', invoiceHash);
          console.log('🔍 [DECRYPT] Details:', JSON.stringify(details, null, 2));
          
          // 重新计算哈希验证完整性
          const recomputedHash = await cryptoService.computeInvoiceHash(details);
          console.log('🔍 [DECRYPT] Original hash:', invoiceHash);
          console.log('🔍 [DECRYPT] Recomputed hash:', recomputedHash);
          console.log('🔍 [DECRYPT] Hashes match:', recomputedHash === invoiceHash);
          
          if (recomputedHash !== invoiceHash) {
            console.warn('⚠️ [DECRYPT] Hash mismatch detected! Data may have been tampered with.');
          }
          
          // 构建Invoice对象
          // 注意：IndexedDB中只存储了加密的details，其他字段需要从链上Record获取
          // 这里先构建一个基础对象，完整信息会在对账时从链上Record获取
          const invoice: Invoice = {
            id: invoiceHash as AleoField, // 使用hash作为id
            invoiceHash: invoiceHash,
            seller: publicKey || '' as any, // 临时值，实际值从链上Record获取
            buyer: '' as any, // 需要从链上Record获取
            amount: BigInt(details.total * 1_000_000) as any, // 从details估算，实际值从链上Record获取
            dueDate: new Date(), // 需要从链上Record获取
            createdAt: new Date(), // 使用当前时间作为临时值
            status: 0, // 默认状态，实际状态从链上Record获取
            details
          };
          
          decryptedInvoices.push(invoice);
        } catch (error) {
          console.error(`Failed to decrypt invoice ${invoiceHash}:`, error);
          // 继续处理其他发票
        }
      }

      // 清空现有发票并添加解密后的发票
      clearInvoices();
      decryptedInvoices.forEach(invoice => addInvoice(invoice));
      
      setInitStatus(InitializationStatus.READY);
    } catch (error) {
      console.error('Failed to load invoices from DB:', error);
      handleError(error as Error);
      setInitStatus(InitializationStatus.IDLE);
    }
  }, [storageService, cryptoService, publicKey, setInitStatus, clearInvoices, addInvoice, handleError]);

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

      // 加载发票
      await loadInvoicesFromDB(masterKey);
    } catch (error) {
      handleError(error as Error);
    }
  }, [initStatus, masterKey, loadInvoicesFromDB, setInitStatus, handleError]);

  /**
   * 处理用户点击解锁
   */
  const handleUnlock = useCallback(async () => {
    try {
      const newMasterKey = await requestAuthorization();
      await loadInvoicesFromDB(newMasterKey);
    } catch (error) {
      handleError(error as Error);
    }
  }, [requestAuthorization, loadInvoicesFromDB, handleError]);

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

