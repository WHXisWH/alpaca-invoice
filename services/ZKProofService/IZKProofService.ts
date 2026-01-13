// services/ZKProofService.ts
import { 
  CreateInvoiceParams, 
  PayInvoiceParams, 
  AleoField, 
  Microcredits 
} from '@/lib/types';

/** * ZKProof 异常枚举：处理证明生成过程中的计算与逻辑错误
 */
export enum ZKProofError {
  PROVING_FAILED = 'PROVING_FAILED',       // WASM 内部计算报错（如输入不满足约束）
  BROWSER_MEMORY_OUT = 'BROWSER_MEMORY_OUT', // 浏览器内存不足以支持证明生成
  INVALID_INPUT = 'INVALID_INPUT',         // 传给 Leo 程序的参数格式不合法
  WORKER_INITIALIZATION_FAILED = 'WORKER_INITIALIZATION_FAILED' // Web Worker 启动失败
}

export interface IZKProofService {
  /**
   * 生成创建发票的证明 (调用合约中的 create_invoice 函数)
   * @param params 创建参数（买家、金额、到期时间）
   * @param invoiceHash 由 CryptoService 计算出的明细哈希
   * @returns 证明负载（用于广播）
   * @throws {ZKProofError.PROVING_FAILED}
   */
  proveCreateInvoice(
    params: CreateInvoiceParams, 
    invoiceHash: AleoField
  ): Promise<any>;

  /**
   * 生成支付发票的证明 (调用合约中的 pay_invoice 函数)
   * @param params 支付参数（发票ID、支付所用的 Credits Record）
   * @param feeRecord 用于支付手续费的原始 Record
   * @returns 证明负载
   * @throws {ZKProofError.PROVING_FAILED}
   */
  provePayInvoice(
    params: PayInvoiceParams, 
    feeRecord: string
  ): Promise<any>;

  /**
   * 生成撤销发票的证明 (调用合约中的 cancel_invoice 函数)
   * @param invoiceRecord 发票对应的原始加密 Record
   * @param feeRecord 用于支付手续费的原始 Record
   * @throws {ZKProofError.PROVING_FAILED}
   */
  proveCancelInvoice(
    invoiceRecord: string, 
    feeRecord: string
  ): Promise<any>;

  /**
   * 订阅证明生成的实时状态
   * 将日志和进度同步到 TransactionStore
   * @param onProgress 回调函数 (百分比 0-100, 实时日志字符串)
   */
  subscribeStatus(
    onProgress: (percent: number, log: string) => void
  ): void;
}