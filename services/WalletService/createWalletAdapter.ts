import type { WalletContextState } from '@demox-labs/aleo-wallet-adapter-react';
import { DecryptPermission } from '@demox-labs/aleo-wallet-adapter-base';
import { IWalletService, WalletServiceError, WalletError } from './IWalletService';
import { getNetworkFromEnv } from '@/lib/network';

/**
 * 适配器：将 WalletContextState 桥接到 IWalletService
 * 
 * 职责：
 * - 桥接 React Hook (useWallet) 和纯 TypeScript Service 层
 * - 处理 connect() 方法的参数差异
 * - 提供统一的 IWalletService 接口
 */
export function createWalletAdapter(walletContext: WalletContextState): IWalletService {
  const network = getNetworkFromEnv();
  const programs = ['credits.aleo', 'zk_invoice.aleo'];

  return {
    // 适配 connect 方法：将无参数接口转换为需要参数的实际调用
    async connect() {
      // 1. 检查是否有可用的钱包
      if (walletContext.wallets.length === 0) {
        throw new WalletServiceError(
          WalletError.NOT_INSTALLED,
          'No wallet adapter available. Please install Leo Wallet.',
          { hint: 'Visit https://leo.app to download' }
        );
      }

      // 2. 如果已经连接成功，直接返回
      if (walletContext.connected && walletContext.publicKey) {
        return;
      }

      // 3. 如果没有选择钱包，选择第一个可用钱包
      // 注意：select() 后 wallet 对象可能不会立即更新，但 connect() 方法会处理
      console.log('🔍 [WalletAdapter] 钱包状态检查:', {
        wallet: walletContext.wallet,
        walletsCount: walletContext.wallets.length,
        wallets: walletContext.wallets.map((w: any) => w.adapter?.name || 'unknown'),
        connected: walletContext.connected,
        publicKey: walletContext.publicKey
      });
      
      // 3. 如果没有选择钱包，选择第一个可用钱包
      // 注意：即使 wallet 对象为 null，connect() 也可能正常工作（内部会处理）
      if (!walletContext.wallet) {
        const firstWallet = walletContext.wallets[0] as any;
        const walletName = firstWallet?.adapter?.name;
        console.log('🔍 [WalletAdapter] 未选择钱包，尝试选择第一个:', walletName);
        
        if (!firstWallet?.adapter?.name) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'No wallet adapter available. Please install Leo Wallet.',
            { hint: 'Visit https://leo.app to download' }
          );
        }
        
        walletContext.select(firstWallet.adapter.name);
        // 短暂等待，但不强制要求 wallet 对象必须存在
        // 因为 connect() 内部可能会处理选中的钱包
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('🔍 [WalletAdapter] select() 后钱包状态:', {
          wallet: walletContext.wallet,
          walletName: (walletContext.wallet as any)?.adapter?.name,
          note: '即使 wallet 为 null，connect() 也可能正常工作'
        });
      }

      // 4. 调用 connect，让钱包适配器自己处理内部状态（单次调用）
      console.log('🔍 [WalletAdapter] 准备调用 walletContext.connect()', {
        network,
        programs,
        decryptPermission: DecryptPermission.OnChainHistory,
        currentWallet: walletContext.wallet?.adapter?.name,
        note: '即使 wallet 为 null，也会尝试连接（弹窗可能已弹出）'
      });
      
      try {
        await walletContext.connect(DecryptPermission.OnChainHistory, network, programs);
        console.log('✅ [WalletAdapter] walletContext.connect() Promise resolved', {
          connected: walletContext.connected,
          publicKey: walletContext.publicKey,
          wallet: walletContext.wallet?.adapter?.name
        });
      } catch (error: any) {
        // 🔍 添加详细的错误日志，帮助诊断问题
        console.error('❌ [WalletAdapter] walletContext.connect() 原始错误:', {
          error,
          errorType: error?.constructor?.name,
          message: error?.message,
          code: error?.code,
          errorCode: error?.error?.code,
          name: error?.name,
          stack: error?.stack,
          stringified: String(error),
          walletContext: {
            wallet: walletContext.wallet,
            walletName: walletContext.wallet?.adapter?.name,
            wallets: walletContext.wallets.map(w => w.adapter.name),
            connected: walletContext.connected,
            publicKey: walletContext.publicKey
          }
        });
        
        // 6. 改进错误处理：更全面地识别用户拒绝的场景
        const errorMessage = error?.message?.toLowerCase() || '';
        const errorString = String(error).toLowerCase();
        const errorCode = error?.code || error?.error?.code;
        
        // 检查多种用户拒绝的场景
        if (
          errorMessage.includes('reject') ||
          errorMessage.includes('denied') ||
          errorMessage.includes('cancel') ||
          errorMessage.includes('user cancelled') ||
          errorString.includes('reject') ||
          errorString.includes('denied') ||
          errorString.includes('cancel') ||
          errorCode === 4001 || // EIP-1193 风格的拒绝代码
          errorCode === 'ACTION_REJECTED' ||
          errorCode === 'USER_REJECTED'
        ) {
          // 重新抛出为 USER_REJECTED，让 WalletServiceImpl 正确处理
          throw new WalletServiceError(
            WalletError.USER_REJECTED,
            'User rejected the connection request',
            { originalError: error }
          );
        }
        
        // 其他错误继续向上抛出，让 WalletServiceImpl 处理
        throw error;
      }
    },
    
    async disconnect() {
      await walletContext.disconnect();
    },
    
    // 转发 signMessage（适配签名格式）
    signMessage: walletContext.signMessage ? 
      async (message: string) => {
        // WalletContextState.signMessage 接受 Uint8Array，返回 Uint8Array
        // 需要转换为 string -> Uint8Array -> 调用 -> Uint8Array -> string
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const messageBytes = encoder.encode(message);
        const signatureBytes = await walletContext.signMessage!(messageBytes);
        return decoder.decode(signatureBytes);
      } : undefined,
    
    // 转发 requestRecords（适配返回格式）
    requestRecords: walletContext.requestRecords ? 
      async (program: string) => {
        const records = await walletContext.requestRecords!(program);
        return { records };
      } : undefined,
    
    // 转发 requestRecordPlaintexts（适配返回格式）
    requestRecordPlaintexts: walletContext.requestRecordPlaintexts ? 
      async (program: string) => {
        const records = await walletContext.requestRecordPlaintexts!(program);
        return { records };
      } : undefined,
    
    // 转发 requestTransaction（直接转发，无需适配）
    requestTransaction: walletContext.requestTransaction ? 
      async (params: {
        address: string;
        chainId: string;
        transitions: Array<{
          program: string;
          functionName: string;
          inputs: string[];
        }>;
        fee: number;
        feePrivate: boolean;
      }) => {
        return await walletContext.requestTransaction!(params);
      } : undefined,

    // 转发 transactionStatus（查询交易状态）
    transactionStatus: walletContext.transactionStatus ?
      async (transactionId: string) => {
        return await walletContext.transactionStatus!(transactionId);
      } : undefined,
  };
}
