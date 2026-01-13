import { AleoField, Invoice } from "@/lib/types";

export interface IInvoiceController {
  // --- 状态暴露 ---
  /** * 核心逻辑：从 Store 取出原始 Invoices
   * 1. 过滤（根据当前地址判断是收到的还是发出的）
   * 2. 转换（将 Status 枚举转为 'Pending' | 'Paid' 等字样）
   * 3. 排序（按时间戳）
   */
  invoices: Array<{
    id: AleoField;
    displayAmount: string;
    statusLabel: string;
    role: 'SELLER' | 'BUYER';
    isDecrypted: boolean;
    data: Invoice; // 原始对象
  }>;
  isLoading: boolean;

  // --- 业务方法 ---
  /** 逻辑：调用 AleoProtocolService 扫描全量 Record -> 对每个结果尝试从 StorageService 匹配明细 */
  refreshInvoices(): Promise<void>;

  /** * 逻辑：
   * 1. 调用 WalletService.requestViewKey 
   * 2. 调用 CryptoService.decryptAleoRecord 解密
   * 3. 得到明细后调用 StorageService 存入本地
   * 4. 更新 Store 状态
   */
  handleDecryptInvoice(invoiceId: AleoField): Promise<void>;
}