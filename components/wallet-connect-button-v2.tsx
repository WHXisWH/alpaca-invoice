'use client';

import { useWalletController } from '@/controller/Wallet/useWalletController';
import { getNetworkFromEnv, getNetworkDisplayName } from '@/lib/network';
import { Wallet, LogOut, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WalletConnectButtonV2() {
  const {
    address,
    publicBalance,
    privateBalance,
    isConnecting,
    networkChanged,
    handleConnect,
    handleLogout,
  } = useWalletController();

  const expectedNetwork = getNetworkFromEnv();
  const networkName = getNetworkDisplayName(expectedNetwork);

  if (!address) {
    return (
      <div className="inline-flex flex-col items-end gap-2">
        {/* Network Change Warning */}
        {networkChanged && (
          <div className="max-w-xs rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800">
            <p className="mb-1 font-medium">Wallet Disconnected</p>
            <p className="text-warning-700">
              Network may have changed. Switch to{' '}
              <strong>{networkName}</strong> and reconnect.
            </p>
          </div>
        )}

        {/* Connect Button with integrated network badge */}
        <div className="inline-flex items-center gap-2">
          <span className="rounded-full bg-accent-100 px-2.5 py-1 text-xs font-medium text-accent-700">
            {networkName}
          </span>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2',
              'bg-accent-500 text-sm font-semibold text-white',
              'shadow-sm transition-all',
              'hover:bg-accent-600 hover:shadow-md',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4" />
                Connect Wallet
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-primary-200 bg-white px-4 py-2.5 shadow-sm">
      {/* Connection Status */}
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
        </span>
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-primary-900">
            {address.slice(0, 8)}...{address.slice(-6)}
          </span>
          <span className="text-xs text-primary-500">{networkName}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-primary-200" />

      {/* Balance */}
      <div className="flex flex-col text-right">
        <span className="text-xs text-primary-500">Balance</span>
        <span className="text-sm font-semibold text-primary-900">
          {publicBalance} <span className="text-xs font-normal text-primary-500">credits</span>
        </span>
      </div>

      {/* Disconnect */}
      <button
        onClick={handleLogout}
        className="rounded-lg p-2 text-primary-400 transition-colors hover:bg-error-50 hover:text-error-600"
        title="Disconnect"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
