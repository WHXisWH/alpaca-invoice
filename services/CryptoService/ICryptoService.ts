// services/CryptoService.ts
import { InvoiceDetails, AleoField, EncryptedPayload } from '@/lib/types';

/** * Crypto 异常枚举 */
export enum CryptoError {
  HASH_MISMATCH = 'HASH_MISMATCH',       // 计算出的哈希与链上存证不符
  DECRYPTION_FAILED = 'DECRYPTION_FAILED', // 解密失败（通常是 ViewKey 错误）
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED'  // 加密失败
}

export interface ICryptoService {
  /**
   * 核心业务哈希：将 InvoiceDetails 按照合约逻辑计算出唯一哈希
   * @param details 发票明细对象
   * @returns 对应合约字段的 AleoField
   */
  computeInvoiceHash(details: InvoiceDetails): AleoField;

  /**
   * 敏感数据本地加密：在保存到 StorageService 之前，用私有密钥加密明细
   * @param details 原始明细
   * @param masterKey 用户的本地推导密钥
   */
  encryptInvoiceDetails(
    details: InvoiceDetails, 
    masterKey: string
  ): Promise<EncryptedPayload>;

  /**
   * 敏感数据本地解密
   * @throws {CryptoError.DECRYPTION_FAILED}
   */
  decryptInvoiceDetails(
    payload: EncryptedPayload, 
    masterKey: string
  ): Promise<InvoiceDetails>;

  /**
   * Aleo Record 数据解密：使用 ViewKey 解密来自链上的密文
   * @param ciphertext 原始密文字符串
   * @param viewKey 用户的查看密钥
   */
  decryptAleoRecord(ciphertext: string, viewKey: string): Promise<any>;
}