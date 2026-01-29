import { useCallback, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { ITxController } from './ITxController';
import { useTransactionStore } from '@/stores/Transaction/useTransactionStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { getChainIdFromNetwork, getNetworkFromEnv } from '@/lib/network';
import { CreateInvoiceParams, AleoTransactionId, AleoField, AleoAddress, Invoice } from '@/lib/types';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';
import { useInvoiceChainScan } from '@/controller/Invoice/useInvoiceChainScan';

// 初始化服务实例（在 hook 内部使用）
const cryptoService = new CryptoService();

const PROGRAM_ID = 'zk_invoice.aleo';

/**
 * Transaction Controller Hook
 * 实现开票的完整流程，按照架构图的三个阶段执行
 */
export function useTransactionController(): ITxController {
  const wallet = useWallet();
  const { isProcessing, progress, logs, startTx, updateProgress, completeTx } = useTransactionStore();
  const { publicKey, masterKey, setMasterKey } = useUserStore();
  const invoiceStore = useInvoiceStore();
  const { scanInvoiceRecord } = useInvoiceChainScan(); // Use scan hook to fetch record

  // Create WalletService instance via adapter (aligned with useWalletController)
  const walletService = useMemo(() => {
    if (!wallet) return null;
    const adapter = createWalletAdapter(wallet);
    return new WalletService(adapter);
  }, [wallet]);

  /**
   * Execute the full create-invoice flow
   * 1) permission & data prep
   * 2) proof generation & chain broadcast
   * 3) local archival & status sync
   */
  const executeCreateInvoice = useCallback(
    async (params: CreateInvoiceParams): Promise<AleoField> => {
      try {
        // Phase 1: permission & data prep
        // Ensure wallet is connected
        if (!publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Wallet not connected. Please connect your wallet first.'
          );
        }

        // Validate buyer address (frontend already checks; this is a safeguard)
        const buyerAddress = params.buyer.trim() as AleoAddress;
        const ALEO_ADDR_REGEX = /^aleo1[0-9a-z]{58}$/;
        if (!ALEO_ADDR_REGEX.test(buyerAddress)) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Invalid buyer address format. It must start with aleo1 and be 63 characters long.'
          );
        }
        if (buyerAddress === publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Buyer address cannot be the same as seller address.'
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
            buyerAddress,
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

        const invoiceId = invoiceHash;

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

          // ✅ 不再单独保存到 IndexedDB，addInvoice 会处理完整持久化
          updateProgress(95, '✓ 发票明细已加密');
          console.log('✅ [TransactionController] 发票明细加密成功');
        } catch (error: any) {
          // 记录详细的错误信息
          console.error('❌ [TransactionController] 加密失败:', {
            error,
            errorType: error?.constructor?.name,
            errorMessage: error?.message,
            masterKeyExists: !!currentMasterKey,
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
          
          // 其他错误直接抛出
          throw error;
        }

        // ✅ 更新 Invoice Store（使用新的持久化方法，会自动保存完整发票到 IndexedDB）
        if (invoiceStore?.addInvoice) {
          await invoiceStore.addInvoice({
            id: invoiceId,
            seller: publicKey,
            buyer: buyerAddress,
            amount: params.amount,
            invoiceHash: invoiceHash,
            dueDate: params.dueDate,
            createdAt: new Date(),
            status: 0, // PENDING
            details: params.details,
            metadata: { // ✅ 添加 metadata，设置 action 为 'create'
              confirmationStatus: 'SENDING',
              lastUpdated: new Date(),
              dataSource: 'local',
              action: 'create'
            }
          }, {
            masterKey: currentMasterKey,
            persistFull: true  // ✅ 持久化完整发票信息（包括基本信息）
          });
          updateProgress(97, '✓ 已保存到本地存储 (状态: SENDING)');
          console.log('✅ [TransactionController] 发票已保存到 Store 和 IndexedDB:', invoiceHash);
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
    [publicKey, masterKey, setMasterKey, startTx, updateProgress, completeTx, invoiceStore, logs, walletService]
  );

  /**
   * 执行支付发票（mark_as_paid）
   */
  const executePay = useCallback(
    async (invoice: Invoice): Promise<AleoTransactionId> => {
      try {
        // 检查钱包连接
        if (!publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Wallet not connected. Please connect your wallet first.'
          );
        }

        if (!walletService) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Wallet service not initialized.'
          );
        }

        startTx('REQUESTING');
        updateProgress(10, 'Fetching invoice record from chain...');

        // ✅ 从链上扫描获取 invoice record
        const { rawRecord } = await scanInvoiceRecord(invoice.invoiceHash, invoice.id);
        
        if (!rawRecord) {
          throw new Error('Invoice record not found on chain. Please wait for chain confirmation.');
        }

        // ✅ 使用原始 record 对象（钱包会处理加密和签名）
        const invoiceRecord = rawRecord;

        updateProgress(30, 'Invoice record found. Preparing payment...');

        // 2. 生成 payment_nonce
        const paymentNonce = await cryptoService.computeInvoiceHash({
          invoiceNumber: `PAYMENT-${Date.now()}-${Math.random()}`,
          lineItems: [],
          subtotal: 0,
          taxRate: 0,
          taxAmount: 0,
          total: 0,
          currency: 'CREDITS'
        });

        updateProgress(50, 'Submitting payment transaction...');

        // 3. 调用 mark_as_paid transition
        const chainId = getChainIdFromNetwork(getNetworkFromEnv());
        const requestId = await walletService.requestTransaction({
          functionName: 'mark_as_paid',
          inputs: [
            invoiceRecord,
            paymentNonce
          ],
          publicKey: publicKey,
          programId: PROGRAM_ID,
          fee: 1000000,
          chainId: chainId
        });

        if (!requestId) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Payment transaction failed - no response from wallet'
          );
        }

        // ✅ 更新 invoice 的 metadata，将 confirmationStatus 更改为 SENDING，并设置 action 为 'pay'
        if (invoiceStore?.updateInvoice && masterKey) {
          try {
            await invoiceStore.updateInvoice(invoice.id, {
              metadata: {
                confirmationStatus: 'SENDING',
                dataSource: 'local',
                action: 'pay' // ✅ 标识这是支付操作
              }
            } as any, {
              masterKey: masterKey,
              persistFull: true
            });
            console.log('✅ [executePay] Updated invoice metadata to SENDING with action=pay:', invoice.id);
          } catch (error) {
            console.error('❌ [executePay] Failed to update invoice metadata:', error);
            // 不抛出错误，因为交易已经提交成功
          }
        }

        updateProgress(90, 'Payment transaction submitted successfully');
        updateProgress(100, '✓ Payment completed!');
        
        completeTx();

        // 返回 requestId 作为 transactionId
        return requestId as AleoTransactionId;
      } catch (error: any) {
        completeTx();
        throw error;
      }
    },
    [publicKey, walletService, scanInvoiceRecord, cryptoService, startTx, updateProgress, completeTx]
  );

  /**
   * 执行取消发票（cancel_invoice）
   */
  const executeCancel = useCallback(
    async (invoice: Invoice): Promise<AleoTransactionId> => {
      try {
        // 检查钱包连接
        if (!publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Wallet not connected. Please connect your wallet first.'
          );
        }

        if (!walletService) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Wallet service not initialized.'
          );
        }

        startTx('REQUESTING');
        updateProgress(10, 'Fetching invoice record from chain...');

        // ✅ 从链上扫描获取 invoice record
        const { rawRecord } = await scanInvoiceRecord(invoice.invoiceHash, invoice.id);
        
        if (!rawRecord) {
          throw new Error('Invoice record not found on chain. Please wait for chain confirmation.');
        }

        // ✅ 使用原始 record 对象（钱包会处理加密和签名）
        const invoiceRecord = rawRecord;

        updateProgress(40, 'Invoice record found. Preparing cancellation...');

        // 2. 调用 cancel_invoice transition
        const chainId = getChainIdFromNetwork(getNetworkFromEnv());
        const requestId = await walletService.requestTransaction({
          functionName: 'cancel_invoice',
          inputs: [
            invoiceRecord
          ],
          publicKey: publicKey,
          programId: PROGRAM_ID,
          fee: 1000000,
          chainId: chainId
        });
        if (!requestId) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Cancellation transaction failed - no response from wallet'
          );
        }

        // ✅ 更新 invoice 的 metadata，将 confirmationStatus 更改为 SENDING，并设置 action 为 'cancel'
        if (invoiceStore?.updateInvoice && masterKey) {
          try {
            await invoiceStore.updateInvoice(invoice.id, {
              metadata: {
                confirmationStatus: 'SENDING',
                dataSource: 'local',
                action: 'cancel' // ✅ 标识这是取消操作
              }
            } as any, {
              masterKey: masterKey,
              persistFull: true
            });
            console.log('✅ [executeCancel] Updated invoice metadata to SENDING with action=cancel:', invoice.id);
          } catch (error) {
            console.error('❌ [executeCancel] Failed to update invoice metadata:', error);
            // 不抛出错误，因为交易已经提交成功
          }
        }

        updateProgress(90, 'Cancellation transaction submitted successfully');
        updateProgress(100, '✓ Invoice cancelled!');
        
        completeTx();

        // 返回 requestId 作为 transactionId
        return requestId as AleoTransactionId;
      } catch (error: any) {
        completeTx();
        throw error;
      }
    },
    [publicKey, walletService, scanInvoiceRecord, startTx, updateProgress, completeTx, invoiceStore, masterKey]
  );

  return {
    isProcessing,
    currentProgress: progress,
    currentLog: logs[logs.length - 1] || '',
    executeCreateInvoice,
    executePay,
    executeCancel
  };
}
