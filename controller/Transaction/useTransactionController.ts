import { useCallback, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { ITxController } from './ITxController';
import { useTransactionStore } from '@/stores/Transaction/useTransactionStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { createWalletAdapter } from '@/controller/Wallet/useWalletController';
import { getChainIdFromNetwork, getNetworkFromEnv } from '@/lib/network';
import { CreateInvoiceParams, AleoTransactionId, AleoField } from '@/lib/types';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { StorageService } from '@/services/StorageService/StorageServiceImpl';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';

// 初始化服务实例（在 hook 内部使用）
const cryptoService = new CryptoService();
const storageService = new StorageService();

const PROGRAM_ID = 'zk_invoice.aleo';

/**
 * Transaction Controller Hook
 * 实现开票的完整流程，按照架构图的三个阶段执行
 */
export function useTransactionController(): ITxController {
  const wallet = useWallet();
  const { isProcessing, progress, logs, startTx, updateProgress, completeTx } = useTransactionStore();
  const { publicKey, masterKey, setMasterKey } = useUserStore();
  const newInvoiceStore = useNewInvoiceStore();

  // 创建 WalletService 实例（通过适配器，与 useWalletController 保持一致）
  const walletService = useMemo(() => {
    if (!wallet) return null;
    const adapter = createWalletAdapter(wallet);
    return new WalletService(adapter);
  }, [wallet]);

  /**
   * 执行创建发票的完整流程
   * 
   * 流程分为三个阶段（参考架构图）：
   * 1. 权限检查与数据准备
   * 2. 零知识证明生成与链上广播
   * 3. 本地加密归档与状态同步
   */
  const executeCreateInvoice = useCallback(
    async (params: CreateInvoiceParams): Promise<AleoField> => {
      try {
        // ==================== 阶段 1: 权限检查与数据准备 ====================
        // 检查钱包连接
        if (!publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Wallet not connected. Please connect your wallet first.'
          );
        }

        // 检查 walletService 是否已初始化
        if (!walletService) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Wallet service not initialized. Please ensure wallet is available.',
            { hint: 'Visit https://leo.app to download Leo Wallet' }
          );
        }

        // 按需触发身份授权（如果 masterKey 不存在）
        let currentMasterKey = masterKey;
        if (!currentMasterKey) {
          updateProgress(0, 'AUTHORIZING - 请求签名授权...');
          
          try {
            // 请求签名
            const signature = await walletService.signMessage(
              'Sign to access your private invoices',
              publicKey
            );
            
            if (!signature) {
              throw new WalletServiceError(
                WalletError.USER_REJECTED,
                'Failed to obtain signature for master key generation'
              );
            }

            // 从签名派生主密钥
            currentMasterKey = await cryptoService.deriveMasterKey(signature);
            setMasterKey(currentMasterKey);
            updateProgress(5, '✓ 主密钥已生成');
          } catch (error: any) {
            // 如果是用户拒绝签名，直接抛出
            if (error instanceof WalletServiceError && error.code === WalletError.USER_REJECTED) {
              throw error;
            }
            // 其他错误包装为 WalletServiceError
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'Failed to generate master key',
              { originalError: error }
            );
          }
        }

        // 开始 HASHING 阶段
        startTx('HASHING');
        updateProgress(10, 'HASHING - 计算发票哈希...');

        // 计算发票哈希
        const invoiceHash = await cryptoService.computeInvoiceHash(params.details);
        
        // 调试日志：记录原始数据和计算出的哈希
        console.log('🔍 [CREATE] Original details:', JSON.stringify(params.details, null, 2));
        console.log('🔍 [CREATE] Canonical JSON:', JSON.stringify(params.details, Object.keys(params.details).sort()));
        console.log('🔍 [CREATE] Computed hash:', invoiceHash);
        
        updateProgress(15, `✓ 发票哈希: ${invoiceHash.slice(0, 20)}...`);

        // 准备链上参数
        updateProgress(20, 'PREPARING - 准备交易参数...');
        const dueTimestamp = Math.floor(params.dueDate.getTime() / 1000);
        const amountStr = `${params.amount.toString()}u64`;
        
        // 生成随机 nonce
        const nonceField = await cryptoService.computeInvoiceHash({
          invoiceNumber: `NONCE-${Date.now()}-${Math.random()}`,
          lineItems: [],
          subtotal: 0,
          taxRate: 0,
          taxAmount: 0,
          total: 0,
          currency: 'CREDITS'
        });

        updateProgress(25, '✓ 交易参数准备完成');

        // ==================== 阶段 2: 提交交易请求 (异步任务提交) ====================
        
        startTx('REQUESTING');
        updateProgress(30, 'REQUESTING - 提交交易请求...');

        // 通过钱包服务请求交易（钱包在后台生成证明并准备广播）
        // 从环境变量获取 chainId，与 useWalletController 保持一致
        const chainId = getChainIdFromNetwork(getNetworkFromEnv());
        const requestId = await walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: [
            params.buyer,
            amountStr,
            `${dueTimestamp}u32`,
            invoiceHash,
            nonceField
          ],
          publicKey: publicKey,
          programId: PROGRAM_ID,
          fee: 1000000,
          chainId: chainId
        });

        if (!requestId) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Transaction failed - no response from wallet'
          );
        }

        // 注意：requestTransaction 立即返回 requestId (UUID)
        // 钱包在后台生成证明并准备广播，不阻塞后续流程
        updateProgress(35, `✓ 交易请求已提交 (requestId: ${requestId.slice(0, 20)}...)`);

        const invoiceId = `${nonceField.slice(0, 32)}field` as AleoField;

        // ==================== 阶段 3: 本地加密归档与即时跳转 ====================
        
        startTx('ARCHIVING');
        updateProgress(90, 'ARCHIVING - 加密存储发票明细...');

        // 确保 currentMasterKey 存在
        if (!currentMasterKey) {
          console.error('❌ [TransactionController] Master key is missing:', {
            masterKeyFromStore: masterKey,
            currentMasterKey,
            publicKey
          });
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Master key is missing. Cannot encrypt invoice details.',
            { hint: 'Please try creating the invoice again' }
          );
        }

        // 添加调试日志
        console.log('🔍 [TransactionController] 准备加密存储:', {
          currentMasterKey: currentMasterKey ? `${currentMasterKey.slice(0, 10)}...` : 'null',
          masterKeyLength: currentMasterKey?.length,
          invoiceHash,
          hasDetails: !!params.details,
          detailsKeys: params.details ? Object.keys(params.details) : []
        });

        try {
          // 加密发票明细
          const encryptedPayload = await cryptoService.encryptInvoiceDetails(
            params.details,
            currentMasterKey
          );
          updateProgress(92, '✓ 发票明细已加密');
          console.log('✅ [TransactionController] 发票明细加密成功:', {
            payloadSize: JSON.stringify(encryptedPayload).length,
            hasCiphertext: !!encryptedPayload.ciphertext,
            hasIv: !!encryptedPayload.iv
          });

          // 保存到 IndexedDB（初始状态设为 'SENDING'）
          await storageService.saveEncryptedInvoice(invoiceHash, encryptedPayload);
          updateProgress(95, '✓ 已保存到本地存储 (状态: SENDING)');
          console.log('✅ [TransactionController] 发票已保存到 IndexedDB:', invoiceHash);
        } catch (error: any) {
          // 记录详细的错误信息
          console.error('❌ [TransactionController] 加密或存储失败:', {
            error,
            errorType: error?.constructor?.name,
            errorMessage: error?.message,
            errorStack: error?.stack,
            masterKeyExists: !!currentMasterKey,
            masterKeyLength: currentMasterKey?.length,
            invoiceHash,
            hasDetails: !!params.details
          });
          
          // 如果是加密失败
          if (error?.message?.includes('encrypt') || 
              error?.message?.includes('Encryption') ||
              error?.message?.includes('deriveEncryptionKey')) {
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'Failed to encrypt invoice details',
              { 
                originalError: error,
                hint: 'Master key may be invalid or missing. Please try again.'
              }
            );
          }
          
          // 如果是存储失败
          if (error?.message?.includes('save') || 
              error?.message?.includes('IndexedDB') ||
              error?.message?.includes('Failed to save')) {
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'Failed to save encrypted invoice to local storage',
              { 
                originalError: error,
                hint: 'Please check browser IndexedDB permissions or try again'
              }
            );
          }
          
          // 其他错误直接抛出
          throw error;
        }

        // 更新 Invoice Store（如果新架构的 store 已实现）
        if (newInvoiceStore?.addInvoice) {
          newInvoiceStore.addInvoice({
            id: invoiceId,
            seller: publicKey,
            buyer: params.buyer,
            amount: params.amount,
            invoiceHash: invoiceHash,
            dueDate: params.dueDate,
            createdAt: new Date(),
            status: 0, // PENDING
            details: params.details
          });
        }

        updateProgress(98, '✓ 状态已同步');
        updateProgress(100, '✓ 发票创建成功！');

        // 完成交易
        completeTx();

        // 返回 invoiceHash（View 层用于跳转到发票详情页）
        // 注意：根据时序图，归档成功后应跳转到 /invoices/:hash
        return invoiceHash;
      } catch (error: any) {
        // 重置状态
        completeTx();
        // 重新抛出错误，让 View 层处理
        throw error;
      }
    },
    [publicKey, masterKey, setMasterKey, startTx, updateProgress, completeTx, newInvoiceStore, logs, walletService]
  );

  /**
   * 执行支付发票（待实现）
   */
  const executePay = useCallback(
    async (invoiceId: AleoField): Promise<AleoTransactionId> => {
      try {
        // TODO: 实现支付逻辑
        throw new Error('支付功能待实现');
      } catch (error: any) {
        // 重新抛出错误，让 View 层处理
        throw error;
      }
    },
    []
  );

  return {
    isProcessing,
    currentProgress: progress,
    currentLog: logs[logs.length - 1] || '',
    executeCreateInvoice,
    executePay
  };
}