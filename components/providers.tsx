'use client';

import { WalletProvider } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletModalProvider } from '@demox-labs/aleo-wallet-adapter-reactui';
import { LeoWalletAdapter } from '@demox-labs/aleo-wallet-adapter-leo';
import { DecryptPermission } from '@demox-labs/aleo-wallet-adapter-base';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { getNetworkFromEnv } from '@/lib/network';
import { CREDITS_PROGRAM_ID, PROGRAM_ID } from '@/lib/program';
import './wallet.css';

type Props = {
  children: ReactNode;
};

/**
 * Wallet Provider 配置
 * 
 * 网络由环境变量 NEXT_PUBLIC_ALEO_NETWORK 控制
 * 当用户在钱包插件中切换网络时，会触发 disconnect 事件
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
      programs={[CREDITS_PROGRAM_ID, PROGRAM_ID]}
      autoConnect
    >
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}
