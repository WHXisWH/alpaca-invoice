import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserState } from './UserState';

/**
 * User Store 实现（带持久化）
 * 存储当前连接的账户信息和余额
 * 
 * 持久化策略：
 * - publicKey, connected 持久化到 localStorage（跨会话持久）
 * - masterKey 持久化到 sessionStorage（仅当前会话，标签页关闭后清除）
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
        // 确保立即保存到 sessionStorage（zustand persist 会自动处理，但这里添加显式保存以确保）
        if (masterKey) {
          try {
            const sessionStorageData = { masterKey };
            sessionStorage.setItem('aleo-wallet-storage-masterKey', JSON.stringify(sessionStorageData));
          } catch (error) {
            console.error('❌ [UserStore] Failed to save masterKey to sessionStorage:', error);
          }
        }
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
      name: 'aleo-wallet-storage', // localStorage key (用于 publicKey 和 connected)
      // 只持久化 publicKey, connected, masterKey
      partialize: (state) => ({
        publicKey: state.publicKey,
        connected: state.connected,
        masterKey: state.masterKey,
      }),
      // 自定义存储：publicKey/connected 用 localStorage，masterKey 用 sessionStorage
      storage: {
        getItem: (name) => {
          // 从 localStorage 读取 publicKey 和 connected
          const localStorageStr = localStorage.getItem(name);
          // 从 sessionStorage 读取 masterKey
          const sessionStorageStr = sessionStorage.getItem(`${name}-masterKey`);
          
          let parsed: any = { state: {} };
          
          if (localStorageStr) {
            const localStorageParsed = JSON.parse(localStorageStr);
            if (localStorageParsed.state) {
              parsed.state.publicKey = localStorageParsed.state.publicKey;
              parsed.state.connected = localStorageParsed.state.connected;
            }
          }
          
          if (sessionStorageStr) {
            const sessionStorageParsed = JSON.parse(sessionStorageStr);
            if (sessionStorageParsed.masterKey !== undefined) {
              parsed.state.masterKey = sessionStorageParsed.masterKey;
            }
          }
          
          // 将余额重置为 0n（不持久化）
          parsed.state.publicBalance = 0n;
          parsed.state.privateBalance = 0n;
          
          // 如果没有数据，返回 null
          if (!parsed.state.publicKey && !parsed.state.connected && !parsed.state.masterKey) {
            return null;
          }
          
          return parsed;
        },
        setItem: (name, value) => {
          // 将 publicKey 和 connected 写入 localStorage
          const localStorageData = {
            state: {
              publicKey: value.state.publicKey,
              connected: value.state.connected,
            }
          };
          localStorage.setItem(name, JSON.stringify(localStorageData));
          
          // 将 masterKey 写入 sessionStorage
          const sessionStorageData = {
            masterKey: value.state.masterKey,
          };
          sessionStorage.setItem(`${name}-masterKey`, JSON.stringify(sessionStorageData));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
          sessionStorage.removeItem(`${name}-masterKey`);
        },
      },
    }
  )
);

