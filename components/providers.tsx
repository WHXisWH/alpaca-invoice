'use client';

import { WalletProvider } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletModalProvider } from '@demox-labs/aleo-wallet-adapter-reactui';
import { LeoWalletAdapter } from '@demox-labs/aleo-wallet-adapter-leo';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import './wallet.css';

type Props = {
  children: ReactNode;
};

export default function Providers({ children }: Props) {
  const wallets = useMemo(
    () => [
      new LeoWalletAdapter({
        appName: 'ZK Invoice'
      })
    ],
    []
  );

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}
