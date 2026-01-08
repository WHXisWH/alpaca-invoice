'use client';

import { create } from 'zustand';
import type { AleoAddress, Microcredits } from '@/lib/types';

interface WalletState {
  connected: boolean;
  address: AleoAddress | null;
  publicBalance: Microcredits;
  privateBalance: Microcredits;
  creditsRecords: string[];
  network: 'mainnet' | 'testnet';
  isLoggingIn: boolean;
  isLoading: boolean;
  error: string | null;
}

interface WalletActions {
  setConnected: (value: boolean) => void;
  setAddress: (address: AleoAddress | null) => void;
  setCreditsRecords: (records: string[]) => void;
  updateBalances: (publicBal: Microcredits, privateBal: Microcredits) => void;
  setNetwork: (network: 'mainnet' | 'testnet') => void;
  reset: () => void;
  refreshBalance: () => Promise<void>;
}

type WalletStore = WalletState & WalletActions;

export const useWalletStore = create<WalletStore>((set) => ({
  connected: false,
  address: null,
  publicBalance: 0n,
  privateBalance: 0n,
  creditsRecords: [],
  network: 'testnet',
  isLoggingIn: false,
  isLoading: false,
  error: null,
  setConnected: (value) => set({ connected: value }),
  setAddress: (address) => set({ address }),
  setCreditsRecords: (records) => set({ creditsRecords: records }),
  updateBalances: (publicBal, privateBal) =>
    set({ publicBalance: publicBal, privateBalance: privateBal }),
  setNetwork: (network) => set({ network }),
  reset: () =>
    set({
      connected: false,
      address: null,
      publicBalance: 0n,
      privateBalance: 0n,
      creditsRecords: [],
      network: 'testnet',
      isLoggingIn: false,
      isLoading: false,
      error: null
    }),
  refreshBalance: async () => {
    set({ isLoading: true });
    // Placeholder: integrate with Aleo SDK / wallet view key to fetch balances.
    set({
      publicBalance: 0n,
      privateBalance: 0n,
      creditsRecords: [],
      isLoading: false
    });
  }
}));
