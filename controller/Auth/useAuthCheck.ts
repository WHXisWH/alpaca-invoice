import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useUserStore } from '@/stores/User/useUserStore';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { createWalletAdapter } from '@/controller/Wallet/useWalletController';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';
import { toast } from 'sonner';

/**
 * useAuthCheck Hook
 * 独立的授权检查和处理逻辑
 * 可在多个地方复用（列表页、详情页等）
 */
export function useAuthCheck() {
  const wallet = useWallet();
  const { masterKey, publicKey, setMasterKey } = useUserStore();
  const { handleError } = useErrorHandler();
  const [isRequestingAuth, setIsRequestingAuth] = useState(false);

  // 使用 useMemo 缓存服务实例
  const walletService = useMemo(() => 
    wallet ? new WalletService(createWalletAdapter(wallet)) : null,
    [wallet]
  );
  const cryptoService = useMemo(() => new CryptoService(), []);

  /**
   * 检查是否需要授权
   */
  const isAuthRequired = useMemo((): boolean => {
    return !masterKey && !!publicKey && !!wallet?.connected;
  }, [masterKey, publicKey, wallet?.connected]);

  /**
   * 处理解锁（请求授权并派生 masterKey）
   */
  const handleUnlock = useCallback(async () => {
    if (!walletService || !publicKey) {
      toast.error('Wallet not connected', {
        description: 'Please connect your wallet first'
      });
      return;
    }

    setIsRequestingAuth(true);
    try {
      toast.loading('Requesting authorization...', { id: 'auth-unlock' });

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
      
      toast.success('Authorization successful', {
        id: 'auth-unlock',
        description: 'You can now access your private invoice data'
      });
    } catch (error: any) {
      console.error('Failed to unlock:', error);
      
      if (error instanceof WalletServiceError && error.code === WalletError.USER_REJECTED) {
        toast.error('Authorization cancelled', {
          id: 'auth-unlock',
          description: 'Please approve the signature request to continue'
        });
      } else {
        toast.error('Authorization failed', {
          id: 'auth-unlock',
          description: error instanceof Error ? error.message : 'Unknown error occurred'
        });
      }
      
      handleError(error as Error);
    } finally {
      setIsRequestingAuth(false);
    }
  }, [walletService, publicKey, cryptoService, setMasterKey, handleError]);

  return {
    isAuthRequired,
    handleUnlock,
    isRequestingAuth
  };
}

