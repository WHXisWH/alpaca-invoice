import { create } from 'zustand';
import { UserState } from './UserState';

/**
 * User Store 实现
 * 存储当前连接的账户信息和余额
 */
export const useUserStore = create<UserState>((set) => ({
  // 初始状态
  publicKey: null,
  connected: false,
  viewKey: null,
  publicBalance: 0n,
  privateBalance: 0n,

  // Actions
  setAccount: (publicKey, connected) => {
    set({ publicKey, connected });
  },

  updateBalances: (pub, priv) => {
    set({ 
      publicBalance: pub, 
      privateBalance: priv 
    });
  },

  clearUser: () => {
    set({
      publicKey: null,
      connected: false,
      viewKey: null,
      publicBalance: 0n,
      privateBalance: 0n,
    });
  }
}));

