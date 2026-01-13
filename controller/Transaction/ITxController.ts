import { CreateInvoiceParams, AleoTransactionId, AleoField } from '@/lib/types'

export interface ITxController {
  // --- 状态暴露 ---
  isProcessing: boolean;    // 是否正在生成证明或广播
  currentProgress: number;  // 0-100
  currentLog: string;       // 实时日志（如 "Synthesis in progress..."）

  // --- 业务方法 ---
  /** * 逻辑：
   * 1. 调用 CryptoService.computeInvoiceHash 
   * 2. 启动 ZKProofService.subscribeStatus 监听
   * 3. 调用 ZKProofService.proveCreateInvoice
   * 4. 调用 AleoProtocolService.broadcastTransaction
   */
  executeCreateInvoice(params: CreateInvoiceParams): Promise<AleoTransactionId>;

  /** * 逻辑：
   * 1. 调用 WalletService.getFeeRecords 选票
   * 2. 调用 ZKProofService.provePayInvoice
   * 3. 广播并等待确认 -> 确认后刷新余额
   */
  executePay(invoiceId: AleoField): Promise<AleoTransactionId>;
}