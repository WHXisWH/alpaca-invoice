
import { AleoAddress } from "@/lib/types";

export interface IWalletController {
  // --- 状态暴露 (从 Store 映射) ---
  address: AleoAddress | null;
  publicBalance: string;  // 已从 Microcredits 转换为可读字符串 (如 "10.50")
  privateBalance: string; // 同上
  isConnecting: boolean;
  networkChanged: boolean; // 标识钱包是否已断开（可能因网络切换）

  // --- 业务方法 ---
  /** 逻辑：调用 WalletService.connect -> 成功后触发 syncBalances */
  handleConnect(): Promise<void>;
  
  /** 逻辑：清理所有本地 Store -> 调用 WalletService.disconnect */
  handleLogout(): void;

  /** 逻辑：并行调用 WalletService.getPrivateBalance 和 AleoProtocolService.getPublicBalance -> 更新 WalletStore */
  syncBalances(): Promise<void>;
}