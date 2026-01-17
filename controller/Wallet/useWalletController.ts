import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import type { WalletContextState } from '@demox-labs/aleo-wallet-adapter-react';
import { LeoWalletAdapter } from '@demox-labs/aleo-wallet-adapter-leo';
import { DecryptPermission } from '@demox-labs/aleo-wallet-adapter-base';
import { IWalletController } from './IWalletController';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { IWalletService } from '@/services/WalletService/IWalletService';
import type { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { getNetworkFromEnv } from '@/lib/network';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';
import type { AleoAddress } from '@/lib/types';

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

      // 4. 调用 connect，让钱包适配器自己处理内部状态
      // connect() 方法可能不依赖于 wallet 对象，它内部会处理选中的钱包
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
  };
}

/**
 * Wallet Controller 实现
 * 
 * 职责：处理钱包连接、余额轮询
 * 
 * 架构流程：View -> Controller -> Service（类） -> Store
 * 
 * 网络策略：
 * - 应用网络配置从环境变量读取（静态）
 * - 用户钱包应适应应用网络，而非反过来
 * - 当用户在钱包中切换网络时，会触发 disconnect 事件
 * - 用户重新连接时，Leo Wallet 会自动提示切换到应用要求的网络
 */
export function useWalletController(): IWalletController {
  const wallet = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [networkChanged, setNetworkChanged] = useState(false);
  const [aleoProtocolService, setAleoProtocolService] = useState<AleoProtocolService | null>(null);
  
  // 从 Store 获取状态
  const { 
    publicKey,
    connected,
    publicBalance, 
    privateBalance, 
    setAccount, 
    updateBalances, 
    clearUser 
  } = useUserStore();

  // 错误处理
  const { handleError } = useErrorHandler();

  // 创建 WalletService 实例（通过适配器）
  const walletService = useMemo(() => {
    if (!wallet) return null;
    const adapter = createWalletAdapter(wallet);
    return new WalletService(adapter);
  }, [wallet]);

  // 🔧 异步加载 AleoProtocolService（避免在 Server Component 中加载 WASM）
  useEffect(() => {
    const network = getNetworkFromEnv();
    
    // 动态导入 AleoProtocolService，只在客户端执行
    import('@/services/AleoProtocolService/AleoProtocolServiceImpl')
      .then((module) => {
        const service = new module.AleoProtocolService(network);
        setAleoProtocolService(service);
        console.log('✅ AleoProtocolService initialized on client side');
      })
      .catch((error) => {
        console.error('❌ Failed to initialize AleoProtocolService:', error);
      });
  }, []); // 只在组件挂载时执行一次

  /**
   * 将 Microcredits (bigint) 转换为可读字符串
   */
  const formatBalance = (microcredits: bigint): string => {
    const credits = Number(microcredits) / 1_000_000;
    return credits.toFixed(6);
  };

  /**
   * 同步余额（并行获取公开和私有余额）
   */
  const syncBalances = useCallback(async () => {
    if (!walletService || !publicKey || !aleoProtocolService) return;

    try {
      // 并行获取两种余额
      const [privateBalance, publicBalance] = await Promise.all([
        walletService.getPrivateBalance(publicKey), 
        aleoProtocolService.getPublicBalance(publicKey)
      ]);
      
      updateBalances(publicBalance, privateBalance);
    } catch (error) {
      console.error('Failed to sync balances:', error);
    }
  }, [walletService, aleoProtocolService, publicKey, updateBalances]); 

  /**
   * 处理连接钱包
   */
  const handleConnect = useCallback(async () => {
    if (!walletService) {
      handleError(new WalletServiceError(
        WalletError.NOT_INSTALLED,
        'Wallet service not initialized'
      ));
      return;
    }

    setIsConnecting(true);
    setNetworkChanged(false); // 重置网络变化标志

    try {
      // 1. 调用 Service 层连接钱包
      // Leo Wallet 会自动检测并提示用户切换到 WalletProvider 配置的网络
      await walletService.connect();
      // ✅ 地址和连接状态由 useEffect 监听 wallet 状态后更新
      console.log('✅ Wallet connect() called, waiting for wallet state update...');
    } catch (error: any) {
      // 使用统一的错误处理
      handleError(error);
    } finally {
      setIsConnecting(false);
    }
  }, [walletService, handleError]);

  /**
   * 处理登出
   */
  const handleLogout = useCallback(async () => {
    if (!walletService) return;

    // 重置连接状态
    setIsConnecting(false);

    try {
      // 1. 清理 Store
      clearUser();
      
      // 2. 断开钱包连接
      await walletService.disconnect();

      console.log('✅ Wallet disconnected');
    } catch (error) {
      console.error('❌ Failed to disconnect wallet:', error);
    }
  }, [walletService, clearUser]);

  /**
   * 监听钱包事件
   * 当用户在钱包插件中切换网络时，钱包会断开连接
   */
  useEffect(() => {
    if (!wallet?.wallet?.adapter) return;

    const adapter = wallet.wallet.adapter as LeoWalletAdapter;

    // 监听断开连接事件
    const handleDisconnect = () => {
      console.warn('⚠️ Wallet disconnected - User may have switched network in wallet');
      setNetworkChanged(true);
      setIsConnecting(false); // 重置连接状态
      clearUser();
    };

    // 监听错误事件
    const handleWalletError = (error: any) => {
      console.error('❌ Wallet error:', error);
    };

    adapter.on('disconnect', handleDisconnect);
    adapter.on('error', handleWalletError);

    // 清理事件监听器
    return () => {
      adapter.off('disconnect', handleDisconnect);
      adapter.off('error', handleWalletError);
    };
  }, [wallet, clearUser]);

  /**
   * ✅ 监听 wallet 状态变化，同步到 userStore
   * 当钱包连接成功后，自动更新 store 并同步余额
   */
  useEffect(() => {
    const walletPublicKey = wallet?.publicKey || null;
    const walletConnected = wallet?.connected || false;

    // 如果 wallet 状态与 store 不一致，更新 store
    if (walletPublicKey !== publicKey || walletConnected !== connected) {
      if (walletPublicKey && walletConnected) {
        // 钱包已连接，更新 store
        setAccount(walletPublicKey as AleoAddress, walletConnected);
        console.log('✅ Wallet state synced to store:', walletPublicKey);
      } else if (!walletConnected && publicKey) {
        // 钱包已断开，清理 store
        clearUser();
        console.log('✅ Wallet disconnected, store cleared');
      }
    }
  }, [wallet?.publicKey, wallet?.connected, publicKey, connected, setAccount, clearUser, syncBalances]);

  useEffect(() => {
    // 连接账户成功后，同步余额（页面加载时同步一次）
    if (publicKey && connected) {
      syncBalances()
    }
  }, [publicKey, connected, syncBalances]) 

  return {
    // 状态
    address: publicKey, 
    publicBalance: formatBalance(publicBalance),
    privateBalance: formatBalance(privateBalance),
    isConnecting,
    networkChanged,

    // 方法
    handleConnect,
    handleLogout,
    syncBalances
  };
}
