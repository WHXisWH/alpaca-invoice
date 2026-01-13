// services/CryptoService.ts
import { InvoiceDetails, AleoField, EncryptedPayload } from '@/lib/types';

/** * Crypto 异常枚举 */
export enum CryptoError {
  HASH_MISMATCH = 'HASH_MISMATCH',       // 计算出的哈希与链上存证不符
  DECRYPTION_FAILED = 'DECRYPTION_FAILED', // 解密失败（通常是 ViewKey 错误）
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED'  // 加密失败
}

/**
 * 链上 InvoiceRecord 的结构（wallet.requestRecords() 解密后的数据）
 */
export interface AleoInvoiceRecord {
  owner: string;           // Record 所有者地址
  invoice_id: string;      // 发票唯一ID (Field 格式)
  invoice_hash: string;    // 发票明细哈希 (Field 格式，用于完整性验证)
  amount: string;          // 发票金额 (microcredits)
  seller: string;          // 卖方地址
  buyer: string;           // 买方地址
  due_date: number;        // 到期日期 (Unix timestamp)
  status: number;          // 状态 (0=待支付, 1=已支付, 2=已取消)
  created_at: number;      // 创建时间 (Unix timestamp)
  _nonce?: string;         // Record nonce (可选)
}

export interface ICryptoService {
  /**
   * 核心业务哈希：将 InvoiceDetails 按照合约逻辑计算出唯一哈希
   * 
   * 使用场景：
   * 1. 开票时：计算发票明细的哈希，存入链上 InvoiceRecord.invoice_hash
   * 2. 验证时：重新计算本地明细的哈希，与链上哈希对比
   * 
   * 使用 SHA-256 算法并应用模运算确保结果在 Aleo Field 范围内
   * 
   * @param details 发票明细对象
   * @returns 对应合约字段的 AleoField (格式: "123...field")
   */
  computeInvoiceHash(details: InvoiceDetails): Promise<AleoField>;

  /**
   * 解析来自 wallet.requestRecords() 的已解密 InvoiceRecord
   * 
   * 完整的发票验证流程：
   * ```typescript
   * // 1. 从钱包获取已解密的链上 Record
   * const records = await wallet.requestRecords('zk_invoice.aleo');
   * const chainRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
   *   JSON.stringify(records[0].data)
   * );
   * 
   * // 2. 从 IndexedDB 取出本地加密存储的明细
   * const encryptedPayload = await storageService.getInvoice(chainRecord.invoice_id);
   * const localDetails = await cryptoService.decryptInvoiceDetails(encryptedPayload, masterKey);
   * 
   * // 3. 验证完整性：重新计算哈希并与链上哈希对比
   * const isValid = await cryptoService.verifyInvoiceIntegrity(localDetails, chainRecord.invoice_hash);
   * ```
   * 
   * @param jsonString 已解密的 JSON 字符串（来自 wallet.requestRecords()）
   * @returns 解析后的 Record 数据对象
   * @throws {CryptoServiceError} 如果 JSON 格式无效或为 record1... 加密格式
   */
  parseAleoRecord<T = AleoInvoiceRecord>(jsonString: string): Promise<T>;

  /**
   * 验证发票完整性：对比本地明细的哈希与链上存储的哈希
   * 
   * @param localDetails 本地存储的发票明细（从 IndexedDB 解密获取）
   * @param chainInvoiceHash 链上 Record 中的 invoice_hash 字段
   * @returns true 表示数据完整未被篡改，false 表示数据不一致
   */
  verifyInvoiceIntegrity(localDetails: InvoiceDetails, chainInvoiceHash: AleoField): Promise<boolean>;

  /**
   * 本地加密：将发票明细加密后存入 IndexedDB
   * 使用 PBKDF2 派生密钥 + AES-GCM 对称加密
   * 
   * @param details 原始发票明细
   * @param masterKey 用户的本地推导密钥（字符串格式）
   * @returns 加密载荷 (包含 iv 和 ciphertext)
   */
  encryptInvoiceDetails(details: InvoiceDetails, masterKey: string): Promise<EncryptedPayload>;

  /**
   * 本地解密：从 IndexedDB 读取并解密发票明细
   * 
   * @param payload 加密载荷
   * @param masterKey 用户的本地推导密钥
   * @returns 解密后的发票明细
   * @throws {CryptoServiceError} DECRYPTION_FAILED 如果密钥错误或数据损坏
   */
  decryptInvoiceDetails(payload: EncryptedPayload, masterKey: string): Promise<InvoiceDetails>;
}