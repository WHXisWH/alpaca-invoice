import { AleoAddress, Microcredits } from "@/lib/types";

// 存储当前连接的账户信息和余额
export interface UserState {
  publicKey: AleoAddress | null;    // 钱包公钥地址（原 address）
  connected: boolean;               // 钱包连接状态
  viewKey: string | null;           // 仅在解密会话期间存储
  publicBalance: Microcredits;      // bigint
  privateBalance: Microcredits;     // bigint
  
  // Actions
  setAccount: (publicKey: AleoAddress, connected: boolean) => void;
  updateBalances: (pub: Microcredits, priv: Microcredits) => void;
  clearUser: () => void;
}