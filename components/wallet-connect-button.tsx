'use client';

import { WalletMultiButton } from '@demox-labs/aleo-wallet-adapter-reactui';

export default function WalletConnectButton() {
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm">
      <WalletMultiButton />
    </div>
  );
}
