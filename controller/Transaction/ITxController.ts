import { CreateInvoiceParams, AleoTransactionId, AleoField, Invoice } from '@/lib/types'

export interface ITxController {
  // --- 状态暴露 ---
  isProcessing: boolean;    // 是否正在生成证明或广播
  currentProgress: number;  // 0-100
  currentLog: string;       // 实时日志（如 "Synthesis in progress..."）

  // --- 业务方法 ---
  /** * 逻辑：
   * 1. 调用 CryptoService.computeInvoiceHash 计算发票哈希
   * 2. 调用 WalletService.requestTransaction 请求交易（钱包内部生成 ZKP 证明）
   * 3. 本地加密归档到 IndexedDB
   * @returns invoiceHash 用于跳转到发票详情页
   */
  executeCreateInvoice(params: CreateInvoiceParams): Promise<AleoField>;

  /** * 逻辑：
   * 1. 从 Invoice 对象获取所需数据
   * 2. 调用 WalletService.requestTransaction 请求支付交易（钱包内部生成 ZKP 证明）
   * 3. 返回交易 ID
   */
  executePay(invoice: Invoice): Promise<AleoTransactionId>;

  /** * 执行取消发票
   * 逻辑：
   * 1. 从 Invoice 对象获取所需数据）
   * 2. 调用 cancel_invoice transition
   * 3. 更新本地状态
   */
  executeCancel(invoice: Invoice): Promise<AleoTransactionId>;
}
