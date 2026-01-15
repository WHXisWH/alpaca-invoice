import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserState } from './UserState';

/**
 * User Store 实现（带持久化）
 * 存储当前连接的账户信息和余额
 * 
 * 持久化策略：
 * - publicKey, connected, masterKey 持久化到 localStorage
 * - 余额不持久化（需要实时获取）
 */
export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      // 初始状态
      publicKey: null,
      connected: false,
      masterKey: null,
      publicBalance: 0n,
      privateBalance: 0n,

      // Actions
      setAccount: (publicKey, connected) => {
        set({ publicKey, connected });
      },

      setMasterKey: (masterKey) => {
        set({ masterKey });
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
          masterKey: null,
          publicBalance: 0n,
          privateBalance: 0n,
        });
      }
    }),
    {
      name: 'aleo-wallet-storage', // localStorage key
      // 只持久化 publicKey, connected, masterKey
      partialize: (state) => ({
        publicKey: state.publicKey,
        connected: state.connected,
        masterKey: state.masterKey,
      }),
      // 处理 bigint 序列化（虽然我们不持久化余额，但为了完整性）
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // 将余额重置为 0n（不持久化）
          if (parsed.state) {
            parsed.state.publicBalance = 0n;
            parsed.state.privateBalance = 0n;
          }
          return parsed;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);

