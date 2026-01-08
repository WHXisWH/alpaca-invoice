'use client';

import { useEffect } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useWalletStore } from '@/stores/walletStore';

export default function WalletWatcher() {
  const { publicKey, connected } = useWallet();
  const { setConnected, setAddress } = useWalletStore();

  useEffect(() => {
    setConnected(connected);
    setAddress((publicKey as any) || null);
  }, [connected, publicKey, setAddress, setConnected]);

  return null;
}
