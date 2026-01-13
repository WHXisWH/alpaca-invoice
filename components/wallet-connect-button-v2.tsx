'use client';

import { useWalletController } from '@/controller/Wallet/useWalletController';
import { getNetworkFromEnv, getNetworkDisplayName, getNetworkBadgeClass } from '@/lib/network';

/**
 * 钱包连接按钮（基于 Controller 架构）
 * 
 * 架构层级：View Layer
 * 职责：展示钱包连接状态，触发连接/断开操作，显示网络信息
 * 
 * 网络显示：始终显示应用配置的期望网络（从环境变量）
 */
export default function WalletConnectButtonV2() {
  const { 
    address, 
    publicBalance, 
    privateBalance,
    isConnecting,
    networkChanged,
    handleConnect, 
    handleLogout 
  } = useWalletController();

  // 应用期望的网络（静态配置）
  const expectedNetwork = getNetworkFromEnv();
  const networkName = getNetworkDisplayName(expectedNetwork);
  const networkBadgeClass = getNetworkBadgeClass(expectedNetwork);

  // 未连接状态
  if (!address) {
    return (
      <div className="inline-flex flex-col items-end gap-2">
        {/* 网络标签 - 显示应用期望的网络 */}
        <span className={`text-xs px-2 py-0.5 rounded border ${networkBadgeClass}`}>
          {networkName}
        </span>
        
        {/* 网络切换警告 */}
        {networkChanged && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 max-w-xs">
            <p className="font-medium mb-1">⚠️ 钱包已断开连接</p>
            <p className="text-amber-700">
              钱包网络可能已更改。请在钱包中切换到 <strong>{networkName}</strong> 后重新连接。
            </p>
          </div>
        )}
        
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="inline-flex items-center rounded-lg border border-amber-300 bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isConnecting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Connect Wallet
            </>
          )}
        </button>
      </div>
    );
  }

  // 已连接状态
  return (
    <div className="inline-flex flex-col gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-sm">
      {/* 地址和网络显示 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <span className="text-sm font-medium text-slate-700">
            {address.slice(0, 12)}...{address.slice(-8)}
          </span>
          {/* 网络徽章 - 显示应用期望的网络 */}
          <span className={`text-xs px-1.5 py-0.5 rounded border ${networkBadgeClass}`}>
            {networkName}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-500 hover:text-red-600 transition-colors"
          title="Disconnect"
        >
          Disconnect
        </button>
      </div>

      {/* 余额显示 */}
      <div className="flex gap-4 text-xs text-slate-600 border-t border-slate-200 pt-2">
        <div>
          <span className="text-slate-500">Public:</span>{' '}
          <span className="font-medium">{publicBalance} Aleo</span>
        </div>
        <div>
          <span className="text-slate-500">Private:</span>{' '}
          <span className="font-medium">{privateBalance} Aleo</span>
        </div>
      </div>
    </div>
  );
}

