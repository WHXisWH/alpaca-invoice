import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';

/**
 * Aleo network normalization
 * Resolves inconsistent network naming across different sources (environment variables, wallet extensions, RPC nodes):
 * - Environment variables typically use shorthand: "mainnet", "testnet"
 * - Wallet adapter uses: "mainnetbeta", "testnet3", "testnetbeta"
 * - RPC Chain ID requires: "mainnet", "testnet3", "testnetbeta"
 */

/**
 * Core conversion logic: map any possible string input to a standard WalletAdapterNetwork enum
 */
export function normalizeNetwork(input: string | undefined | null): WalletAdapterNetwork {
  const net = (input || '').toLowerCase().trim();

  switch (net) {
    // Normalize to MainnetBeta
    case 'mainnet':
    case 'mainnetbeta':
    case WalletAdapterNetwork.MainnetBeta:
      return WalletAdapterNetwork.MainnetBeta;

    // Normalize to Testnet (legacy Testnet3)
    case 'testnet':
    case 'testnet3':
    case WalletAdapterNetwork.Testnet:
      return WalletAdapterNetwork.Testnet;

    // Normalize to Testnet Beta (current mainstream)
    case 'testnetbeta':
    case WalletAdapterNetwork.TestnetBeta:
      return WalletAdapterNetwork.TestnetBeta;

    default:
      // If unrecognized, default to environment variable configuration; if env var is also absent, return TestnetBeta
      const envNet = process.env.NEXT_PUBLIC_ALEO_NETWORK;
      return envNet ? normalizeNetwork(envNet) : WalletAdapterNetwork.TestnetBeta;
  }
}

/**
 * Initialize default network configuration from environment variables
 */
export function getNetworkFromEnv(): WalletAdapterNetwork {
  return normalizeNetwork(process.env.NEXT_PUBLIC_ALEO_NETWORK);
}

/**
 * Get network display name
 * Used for UI Header or status display
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
 * Get CSS class names for the network badge (Tailwind)
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
 * Convert network identifier to Chain ID string
 * Used when submitting Transactions to the wallet or querying RPC nodes
 */
export function getChainIdFromNetwork(network: string | WalletAdapterNetwork): string {
  const normalized = normalizeNetwork(network.toString());

  switch (normalized) {
    case WalletAdapterNetwork.MainnetBeta:
      // Important: Aleo official RPC nodes recognize "mainnet" rather than "mainnetbeta"
      return 'mainnet';
    case WalletAdapterNetwork.Testnet:
      return 'testnet3';
    case WalletAdapterNetwork.TestnetBeta:
      return 'testnetbeta';
    default:
      return 'testnetbeta';
  }
}
