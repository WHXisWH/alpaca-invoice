import { AleoField, AuditKey } from "@/lib/types";

export interface IAuditController {
  /** * 逻辑：
   * 1. 从 StorageService 获取解密明细
   * 2. 调用 WalletService.signMessage 对哈希签名
   * 3. 导出包含 AuditKey 结构的 JSON 文件
   */
  generateAuditPackage(invoiceId: AleoField): Promise<AuditKey>;
  
  /** 逻辑：验证第三方提供的审计包是否真实有效 */
  validatePackage(pkg: AuditKey): Promise<boolean>;
}