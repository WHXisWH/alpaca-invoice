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
 * Wallet Controller Implementation
 *
 * Responsibilities: Handle wallet connection and balance polling
 *
 * Architecture flow: View -> Controller -> Service (class) -> Store
 *
 * Network strategy:
 * - Application network config is read from environment variables (static)
 * - User wallet should adapt to the application network, not the other way around
 * - When user switches network in wallet, a disconnect event is triggered
 * - When user reconnects, Leo Wallet automatically prompts to switch to the application's required network
 */
export function useWalletController(): IWalletController {
  const wallet = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [networkChanged, setNetworkChanged] = useState(false);
  const [aleoProtocolService, setAleoProtocolService] = useState<AleoProtocolService | null>(null);

  // Get state from Store
  const {
    publicKey,
    connected,
    publicBalance,
    privateBalance,
    setAccount,
    updateBalances,
    clearUser
  } = useUserStore();

  // Error handling
  const { handleError } = useErrorHandler();

  // Create WalletService instance (via adapter)
  const walletService = useMemo(() => {
    if (!wallet) return null;
    const adapter = createWalletAdapter(wallet);
    return new WalletService(adapter);
  }, [wallet]);

  // Async load AleoProtocolService (avoid loading WASM in Server Component)
  useEffect(() => {
    const network = getNetworkFromEnv();

    // Dynamically import AleoProtocolService, only executed on client side
    import('@/services/AleoProtocolService/AleoProtocolServiceImpl')
      .then((module) => {
        const service = new module.AleoProtocolService(network);
        setAleoProtocolService(service);
        console.log('✅ AleoProtocolService initialized on client side');
      })
      .catch((error) => {
        console.error('❌ Failed to initialize AleoProtocolService:', error);
      });
  }, []); // Only execute once on component mount

  /**
   * Convert Microcredits (bigint) to a readable string
   */
  const formatBalance = (microcredits: bigint): string => {
    const credits = Number(microcredits) / 1_000_000;
    return credits.toFixed(6);
  };

  /**
   * Sync balances (fetch public and private balances in parallel)
   */
  const syncBalances = useCallback(async () => {
    if (!walletService || !publicKey || !aleoProtocolService) return;

    try {
      // Fetch both balance types in parallel
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
   * Handle wallet connection
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
    setNetworkChanged(false); // Reset network change flag

    try {
      // 1. Call Service layer to connect wallet
      // Leo Wallet automatically detects and prompts user to switch to the network configured in WalletProvider
      await walletService.connect();
      // Address and connection state are updated by useEffect monitoring wallet state
      console.log('✅ Wallet connect() called, waiting for wallet state update...');
    } catch (error: any) {
      // Use unified error handling
      handleError(error);
    } finally {
      setIsConnecting(false);
    }
  }, [walletService, handleError]);

  /**
   * Handle logout
   */
  const handleLogout = useCallback(async () => {
    if (!walletService) return;

    // Reset connection state
    setIsConnecting(false);

    try {
      // 1. Clear Store
      clearUser();

      // 2. Disconnect wallet
      await walletService.disconnect();

      console.log('✅ Wallet disconnected');
    } catch (error) {
      console.error('❌ Failed to disconnect wallet:', error);
    }
  }, [walletService, clearUser]);

  /**
   * Listen for wallet events
   * When user switches network in the wallet plugin, the wallet disconnects
   */
  useEffect(() => {
    if (!wallet?.wallet?.adapter) return;

    const adapter = wallet.wallet.adapter as LeoWalletAdapter;

    // Listen for disconnect event
    const handleDisconnect = () => {
      console.warn('⚠️ Wallet disconnected - User may have switched network in wallet');
      setNetworkChanged(true);
      setIsConnecting(false); // Reset connection state
      clearUser();
    };

    // Listen for error event
    const handleWalletError = (error: any) => {
      console.error('❌ Wallet error:', error);
    };

    adapter.on('disconnect', handleDisconnect);
    adapter.on('error', handleWalletError);

    // Clean up event listeners
    return () => {
      adapter.off('disconnect', handleDisconnect);
      adapter.off('error', handleWalletError);
    };
  }, [wallet, clearUser]);

  /**
   * Monitor wallet state changes and sync to userStore
   * After wallet connects successfully, automatically update store and sync balances
   */
  useEffect(() => {
    const walletPublicKey = wallet?.publicKey || null;
    const walletConnected = wallet?.connected || false;

    // If wallet state differs from store, update store
    if (walletPublicKey !== publicKey || walletConnected !== connected) {
      if (walletPublicKey && walletConnected) {
        // Wallet connected, update store
        setAccount(walletPublicKey as AleoAddress, walletConnected);
        console.log('✅ Wallet state synced to store:', walletPublicKey);
      } else if (!walletConnected && publicKey) {
        // Wallet disconnected, clear store
        clearUser();
        console.log('✅ Wallet disconnected, store cleared');
      }
    }
  }, [wallet?.publicKey, wallet?.connected, publicKey, connected, setAccount, clearUser, syncBalances]);

  useEffect(() => {
    // After account connection succeeds, sync balances (sync once on page load)
    if (publicKey && connected) {
      syncBalances()
    }
  }, [publicKey, connected, syncBalances])

  return {
    // State
    address: publicKey,
    publicBalance: formatBalance(publicBalance),
    privateBalance: formatBalance(privateBalance),
    isConnecting,
    networkChanged,

    // Methods
    handleConnect,
    handleLogout,
    syncBalances
  };
}
