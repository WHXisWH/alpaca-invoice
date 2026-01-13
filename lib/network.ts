import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';

/**
 * 🌐 Aleo 网络归一化处理
 * * 解决不同来源（环境变量、钱包插件、RPC 节点）对网络命名不一致的问题：
 * - 环境变量通常简写为: "mainnet", "testnet"
 * - 钱包适配器使用: "mainnetbeta", "testnet3", "testnetbeta"
 * - RPC Chain ID 要求: "mainnet", "testnet3", "testnetbeta"
 */

/**
 * 核心转换逻辑：将任何可能的字符串输入映射为标准的 WalletAdapterNetwork 枚举
 */
export function normalizeNetwork(input: string | undefined | null): WalletAdapterNetwork {
  const net = (input || '').toLowerCase().trim();

  switch (net) {
    // 归一化为 MainnetBeta
    case 'mainnet':
    case 'mainnetbeta':
    case WalletAdapterNetwork.MainnetBeta:
      return WalletAdapterNetwork.MainnetBeta;

    // 归一化为 Testnet (遗留的 Testnet3)
    case 'testnet':
    case 'testnet3':
    case WalletAdapterNetwork.Testnet:
      return WalletAdapterNetwork.Testnet;

    // 归一化为 Testnet Beta (当前主流)
    case 'testnetbeta':
    case WalletAdapterNetwork.TestnetBeta:
      return WalletAdapterNetwork.TestnetBeta;

    default:
      // 如果无法识别，默认返回环境变量配置，若环境变量也无则返回 TestnetBeta
      const envNet = process.env.NEXT_PUBLIC_ALEO_NETWORK;
      return envNet ? normalizeNetwork(envNet) : WalletAdapterNetwork.TestnetBeta;
  }
}

/**
 * 从环境变量初始化默认网络配置
 */
export function getNetworkFromEnv(): WalletAdapterNetwork {
  return normalizeNetwork(process.env.NEXT_PUBLIC_ALEO_NETWORK);
}

/**
 * 获取网络显示名称
 * 用于 UI Header 或 状态展示
 */
export function getNetworkDisplayName(network: string | WalletAdapterNetwork): string {
  const normalized = normalizeNetwork(network.toString());
  
  switch (normalized) {
    case WalletAdapterNetwork.MainnetBeta:
      return 'Mainnet';
    case WalletAdapterNetwork.Testnet:
      return 'Testnet 3';
    case WalletAdapterNetwork.TestnetBeta:
      return 'Testnet Beta';
    default:
      return 'Unknown';
  }
}

/**
 * 获取网络徽章的 CSS 类名 (Tailwind)
 */
export function getNetworkBadgeClass(network: string | WalletAdapterNetwork): string {
  const normalized = normalizeNetwork(network.toString());
  
  switch (normalized) {
    case WalletAdapterNetwork.MainnetBeta:
      return 'bg-green-100 text-green-700 border-green-200';
    case WalletAdapterNetwork.Testnet:
      return 'bg-gray-100 text-gray-700 border-gray-200';
    case WalletAdapterNetwork.TestnetBeta:
      return 'bg-amber-100 text-amber-700 border-amber-200';
    default:
      return 'bg-red-50 text-red-700 border-red-100';
  }
}

/**
 * 将网络标识转换为 Chain ID 字符串
 * 用于向钱包发起 Transaction 或查询 RPC 节点
 */
export function getChainIdFromNetwork(network: string | WalletAdapterNetwork): string {
  const normalized = normalizeNetwork(network.toString());

  switch (normalized) {
    case WalletAdapterNetwork.MainnetBeta:
      // ⚠️ 重要：Aleo 官方 RPC 节点识别 "mainnet" 而非 "mainnetbeta"
      return 'mainnet';
    case WalletAdapterNetwork.Testnet:
      return 'testnet3';
    case WalletAdapterNetwork.TestnetBeta:
      return 'testnetbeta';
    default:
      return 'testnetbeta';
  }
}