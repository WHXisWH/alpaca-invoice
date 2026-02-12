'use client';

import { WalletProvider } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletModalProvider } from '@demox-labs/aleo-wallet-adapter-reactui';
import { LeoWalletAdapter } from '@demox-labs/aleo-wallet-adapter-leo';
import { DecryptPermission } from '@demox-labs/aleo-wallet-adapter-base';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { getNetworkFromEnv } from '@/lib/network';
import { PROGRAM_ID, LEGACY_PROGRAM_ID, CREDITS_PROGRAM_ID } from '@/lib/contract';
import './wallet.css';

type Props = {
  children: ReactNode;
};

/**
 * Wallet Provider configuration
 *
 * Network is controlled by the NEXT_PUBLIC_ALEO_NETWORK environment variable
 * When the user switches networks in the wallet extension, a disconnect event is triggered
 */
export default function Providers({ children }: Props) {
  const wallets = useMemo(
    () => [
      new LeoWalletAdapter({
        appName: 'ZK Invoice'
      })
    ],
    []
  );

  const network = useMemo(() => getNetworkFromEnv(), []);
  
  return (
    <WalletProvider
      wallets={wallets}
      decryptPermission={DecryptPermission.OnChainHistory}
      network={network}
      programs={[CREDITS_PROGRAM_ID, PROGRAM_ID, LEGACY_PROGRAM_ID]}
      autoConnect
    >
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}
