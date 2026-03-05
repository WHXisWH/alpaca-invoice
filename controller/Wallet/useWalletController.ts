import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { BaseAleoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-core';
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
   * Convert microcredits (bigint) to a readable string
   */
  const formatBalance = (microcredits: bigint): string => {
    const credits = Number(microcredits) / 1_000_000;
    return credits.toFixed(6);
  };

  // Debug logging for wallet state (helps detect stuck "connecting")
  useEffect(() => {
    console.log('🔍 wallet state', {
      name: wallet?.wallet?.adapter?.name,
      readyState: wallet?.wallet?.readyState,
      connected: wallet?.connected,
      connecting: wallet?.connecting,
      address: wallet?.address,
      network: wallet?.wallet?.adapter?.network
    });
  }, [wallet?.wallet, wallet?.connected, wallet?.connecting, wallet?.address]);

  // Log Shield/Fox/Leo availability once on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { shield, leoWallet } = (window as any) || {};
    console.log('🔍 wallet globals', {
      hasShield: !!shield,
      hasLeo: !!leoWallet,
      ua: navigator.userAgent
    });
  }, []);

  // Warn if连接长时间未完成，便于现场排查
  useEffect(() => {
    if (!wallet?.connecting) return;

    const warnTimer = setTimeout(() => {
      console.warn('⏱️ wallet still connecting after 8s', {
        name: wallet?.wallet?.adapter?.name,
        readyState: wallet?.wallet?.readyState,
        network: wallet?.wallet?.adapter?.network,
        address: wallet?.address,
        hasWindowShield: typeof window !== 'undefined' ? !!(window as any)?.shield : 'ssr'
      });
    }, 8000);

    return () => clearTimeout(warnTimer);
  }, [wallet?.connecting, wallet?.wallet]);


  /**
   * Sync balances: private from wallet (always when connected); public from chain when AleoProtocolService is ready
   */
  const syncBalances = useCallback(async () => {
    if (!walletService || !wallet?.connected || !publicKey) return;

    try {
      let privateBalance = 0n;
      let publicBalance = 0n;

      privateBalance = await walletService.getPrivateBalance(publicKey);

      if (aleoProtocolService) {
        publicBalance = await aleoProtocolService.getPublicBalance(publicKey);
      }

      updateBalances(publicBalance, privateBalance);
    } catch (error) {
      console.error('Failed to sync balances:', error);
    }
  }, [walletService, aleoProtocolService, publicKey, updateBalances]);

  /**
   * Handle wallet connection
   */
  const handleConnect = useCallback(async () => {
    // WalletMultiButton opens the modal and triggers connect inside the adapter.
    // Avoid auto-connect here to prevent browsers from blocking the extension popup.
    console.log('🔍 handleConnect: WalletMultiButton will manage selection & connect');
  }, []);

  /**
   * Handle logout
   */
  const handleLogout = useCallback(async () => {
    if (!walletService) return;

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
   * Listen for wallet events; switching network triggers a disconnect
   */
  useEffect(() => {
    if (!wallet?.wallet?.adapter) return;

    const adapter = wallet.wallet.adapter as BaseAleoWalletAdapter;

    // Listen for disconnect event
    const handleDisconnect = () => {
      console.warn('⚠️ Wallet disconnected - User may have switched network in wallet');
      setNetworkChanged(true);
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
   * Monitor wallet state changes and sync to the UserStore
   */
  useEffect(() => {
    const walletPublicKey = wallet?.address || null;
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
  }, [wallet?.address, wallet?.connected, publicKey, connected, setAccount, clearUser, syncBalances]);

  useEffect(() => {
    // After account connection succeeds, sync balances (once on load / on reconnect)
    if (publicKey && connected) {
      syncBalances()
    }
  }, [publicKey, connected, syncBalances])

  return {
    // State
    address: publicKey,
    publicBalance: formatBalance(publicBalance),
    privateBalance: formatBalance(privateBalance),
    networkChanged,

    // Methods
    handleConnect,
    handleLogout,
    syncBalances
  };
}
