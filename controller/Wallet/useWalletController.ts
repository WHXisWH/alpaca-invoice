import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { LeoWalletAdapter } from '@demox-labs/aleo-wallet-adapter-leo';
import { IWalletController } from './IWalletController';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import type { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { getNetworkFromEnv } from '@/lib/network';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';
import type { AleoAddress } from '@/lib/types';

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
