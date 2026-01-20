import { InvoiceDetails, AleoField, EncryptedPayload } from '@/lib/types';
import { ICryptoService, CryptoError, AleoInvoiceRecord } from './ICryptoService';
import { createServiceError } from '@/lib/service-errors';
import {
  encryptInvoiceDetails as encryptDetails,
  decryptInvoiceDetails as decryptDetails,
} from '@/lib/crypto';

/**
 * Aleo Field 的模数（素数 p）
 * p = 8444461749428370424248824938781546531375899335154063827935233455917409239041
 * 这是 Aleo 区块链使用的 BLS12-377 曲线的标量域模数
 */
const ALEO_FIELD_MODULUS = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041');

/**
 * CryptoService 错误类
 */
export const CryptoServiceError = createServiceError<CryptoError>('Crypto');
export type CryptoServiceError = InstanceType<typeof CryptoServiceError>;

/**
 * CryptoService 实现类
 * 
 * 职责：提供加密、解密和哈希计算功能
 * - 计算发票哈希（用于链上存证）
 * - 验证发票完整性（对比链上哈希与本地哈希）
 * - 本地加密/解密发票明细（PBKDF2 + AES-GCM）
 * - 解析 Aleo Record（处理钱包已解密的数据）
 * 
 * 核心验证流程：
 * 1. 开票时：computeInvoiceHash(details) → invoice_hash 存入链上 Record
 * 2. 查看时：parseAleoRecord(jsonString) → 获取链上 invoice_hash
 * 3. 验证时：verifyInvoiceIntegrity(localDetails, chainHash) → 确认数据完整性
 * 
 * 技术特性：
 * - 使用 Web Crypto API 的 SHA-256 进行安全哈希
 * - 应用模运算确保哈希值在 Aleo Field 的有效范围内
 * - 使用 PBKDF2 (100,000 次迭代) 派生加密密钥
 */
export class CryptoService implements ICryptoService {
  /**
   * 核心业务哈希：将 InvoiceDetails 按照合约逻辑计算出唯一哈希
   * 
   * 使用场景：
   * - 开票时：计算哈希 → 存入链上 InvoiceRecord.invoice_hash
   * - 验证时：重新计算本地明细的哈希 → 与链上哈希对比（通过 verifyInvoiceIntegrity）
   * 
   * 实现说明：
   * 1. 使用 SHA-256 算法生成 256 位哈希
   * 2. 将哈希值转换为 BigInt
   * 3. 应用模运算 (hash % ALEO_FIELD_MODULUS) 确保结果在 Field 范围内
   * 4. 返回 AleoField 格式字符串 (例如: "123456789field")
   * 
   * 为什么需要模运算：
   * - Aleo Field 是一个有限域，所有元素必须 < ALEO_FIELD_MODULUS
   * - SHA-256 可能产生大于模数的值，需要通过模运算映射到有效范围
   * - 这确保了链上合约可以正确处理哈希值
   * 
   * @param details 发票明细对象
   * @returns 对应合约字段的 AleoField
   */
  async computeInvoiceHash(details: InvoiceDetails): Promise<AleoField> {
    try {
      // 1. 规范化对象：通过 JSON.parse(JSON.stringify()) 移除 undefined 值
      // 这确保加密/解密前后的对象结构一致
      const normalized = JSON.parse(JSON.stringify(details));
      
      // 2. 深度排序对象键（递归处理嵌套对象和数组）
      const sortObjectKeys = (obj: any): any => {
        if (Array.isArray(obj)) {
          return obj.map(item => sortObjectKeys(item));
        }
        if (obj !== null && typeof obj === 'object') {
          return Object.keys(obj)
            .sort()
            .reduce((sorted: any, key) => {
              sorted[key] = sortObjectKeys(obj[key]);
              return sorted;
            }, {});
        }
        return obj;
      };
      
      const sortedNormalized = sortObjectKeys(normalized);
      const canonical = JSON.stringify(sortedNormalized);
      
      // 调试日志
      console.log('🔐 [computeInvoiceHash] Normalized object:', normalized);
      console.log('🔐 [computeInvoiceHash] Sorted normalized:', sortedNormalized);
      console.log('🔐 [computeInvoiceHash] Canonical JSON:', canonical);
      
      // 3. 获取浏览器原生 Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode(canonical);
      const hashBuffer = await this.getWebCrypto().subtle.digest('SHA-256', data);
      
      // 4. 将 ArrayBuffer 转换为 BigInt (不使用 Buffer)
      // 方案：将 hashBuffer 包装为 Uint8Array，然后逐字节处理
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      const hashBigInt = BigInt('0x' + hashHex);
      
      // 5. 应用模运算确保在 Aleo Field 范围内
      const fieldValue = hashBigInt % ALEO_FIELD_MODULUS;
      
      // 6. 返回 AleoField 格式字符串
      const result = `${fieldValue.toString()}field` as AleoField;
      console.log('🔐 [computeInvoiceHash] Result hash:', result);
      
      return result;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to compute invoice hash in browser',
        { originalError: error }
      );
    }
  }

  /**
   * 敏感数据本地加密：在保存到 StorageService 之前，用私有密钥加密明细
   * 
   * @param details 原始明细
   * @param masterKey 用户的本地推导密钥（字符串格式）
   * @returns 加密后的载荷
   */
  async encryptInvoiceDetails(
    details: InvoiceDetails,
    masterKey: string
  ): Promise<EncryptedPayload> {
    try {
      // 将 masterKey 字符串转换为 Uint8Array
      const encryptionKey = await this.deriveEncryptionKey(masterKey);
      
      // 使用 lib/crypto.ts 中的加密函数
      return await encryptDetails(details, encryptionKey);
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to encrypt invoice details',
        { originalError: error }
      );
    }
  }

  /**
   * 敏感数据本地解密
   * 
   * @param payload 加密载荷
   * @param masterKey 用户的本地推导密钥（字符串格式）
   * @returns 解密后的发票明细
   * @throws {CryptoServiceError} 可能抛出 DECRYPTION_FAILED
   */
  async decryptInvoiceDetails(
    payload: EncryptedPayload,
    masterKey: string
  ): Promise<InvoiceDetails> {
    try {
      // 将 masterKey 字符串转换为 Uint8Array
      const encryptionKey = await this.deriveEncryptionKey(masterKey);
      
      // 使用 lib/crypto.ts 中的解密函数
      return await decryptDetails(payload, encryptionKey);
    } catch (error: any) {
      // 如果是解密失败，抛出特定的错误
      if (error instanceof CryptoServiceError) {
        throw error;
      }
      
      throw new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Failed to decrypt invoice details. Invalid master key or corrupted data.',
        { originalError: error }
      );
    }
  }

  /**
   * 解析来自 wallet.requestRecords() 的已解密 InvoiceRecord
   * 
   * 这是发票验证流程的关键步骤：
   * 1. 钱包通过 requestRecords() 返回已解密的链上 Record
   * 2. 此方法解析 JSON，提取出 invoice_hash 等字段
   * 3. 调用方可以使用 verifyInvoiceIntegrity() 验证数据完整性
   * 
   * 完整验证流程示例：
   * ```typescript
   * // 1. 获取链上 Record
   * const records = await wallet.requestRecords('zk_invoice.aleo');
   * const chainRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
   *   JSON.stringify(records[0].data)
   * );
   * 
   * // 2. 从 IndexedDB 获取本地加密存储的明细
   * const encryptedPayload = await storageService.getInvoice(chainRecord.invoice_id);
   * const localDetails = await cryptoService.decryptInvoiceDetails(encryptedPayload, masterKey);
   * 
   * // 3. 验证完整性
   * const isValid = await cryptoService.verifyInvoiceIntegrity(
   *   localDetails, 
   *   chainRecord.invoice_hash as AleoField
   * );
   * if (!isValid) {
   *   throw new Error('发票数据已被篡改！');
   * }
   * ```
   * 
   * @param jsonString 已解密的 JSON 字符串（来自 wallet.requestRecords()）
   * @returns 解析后的 Record 数据对象（泛型支持，默认 AleoInvoiceRecord）
   * @throws {CryptoServiceError} 如果 JSON 格式无效或为 record1... 加密格式
   */
  async parseAleoRecord<T = AleoInvoiceRecord>(jsonString: string): Promise<T> {
    try {
      // 空字符串检查
      if (!jsonString || jsonString.trim() === '') {
        throw new CryptoServiceError(
          CryptoError.DECRYPTION_FAILED,
          'Empty input string',
          { hint: 'Input cannot be empty' }
        );
      }

      // 处理已解密的 JSON 数据（来自 wallet.requestRecords()）
      if (jsonString.startsWith('{') || jsonString.startsWith('[')) {
        const parsed = JSON.parse(jsonString);
        
        // 清理 Aleo 格式的类型标记和可见性修饰符
        const cleanRecord = (obj: any): any => {
          if (typeof obj === 'string') {
            // 移除 field.private 或 field.public 后缀
            if (obj.includes('field.')) {
              return obj.replace(/field\.(private|public)$/, 'field');
            }
            // 移除数值类型后缀 (u8, u16, u32, u64, u128, i8, i16, i32, i64, i128)
            // 例如: "1000000u64" -> "1000000", "0u8" -> "0"
            if (obj.match(/^\d+[ui](8|16|32|64|128)$/)) {
              return obj.replace(/[ui](8|16|32|64|128)$/, '');
            }
            // 移除其他类型的可见性修饰符（如 .private, .public）
            if (obj.match(/\.(private|public)$/)) {
              return obj.replace(/\.(private|public)$/, '');
            }
          }
          if (Array.isArray(obj)) {
            return obj.map(item => cleanRecord(item));
          }
          if (obj !== null && typeof obj === 'object') {
            const cleaned: any = {};
            for (const key in obj) {
              cleaned[key] = cleanRecord(obj[key]);
            }
            return cleaned;
          }
          return obj;
        };
        
        const cleaned = cleanRecord(parsed);
        // console.log('🧹 [parseAleoRecord] Original record:', parsed);
        // console.log('🧹 [parseAleoRecord] Cleaned record:', cleaned);
        return cleaned as T;
      }
      
      // 如果是 record1... 格式，提示使用正确的方式
      if (jsonString.startsWith('record1')) {
        throw new CryptoServiceError(
          CryptoError.DECRYPTION_FAILED,
          'Encrypted record format detected. Please use wallet.requestRecords() to get decrypted data.',
          { 
            hint: 'The record1... format is encrypted. Use wallet.requestRecords() which automatically decrypts records using your ViewKey.',
            inputPrefix: jsonString.substring(0, 20) + '...'
          }
        );
      }
      
      // 未知格式
      throw new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Unknown input format. Expected JSON string from wallet.requestRecords().',
        { inputPrefix: jsonString.substring(0, Math.min(20, jsonString.length)) + '...' }
      );
    } catch (error: any) {
      if (error instanceof CryptoServiceError) {
        throw error;
      }
      
      throw new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Failed to parse Aleo Record JSON',
        { originalError: error?.message || error }
      );
    }
  }

  /**
   * 验证发票完整性：对比本地明细的哈希与链上存储的哈希
   * 
   * 这是防篡改验证的核心方法：
   * - 重新计算本地发票明细的哈希
   * - 与链上 InvoiceRecord 中存储的 invoice_hash 对比
   * - 如果一致，证明本地数据与链上存证匹配，未被篡改
   * 
   * @param localDetails 本地存储的发票明细（从 IndexedDB 解密获取）
   * @param chainInvoiceHash 链上 Record 中的 invoice_hash 字段
   * @returns true 表示数据完整未被篡改，false 表示数据不一致
   */
  async verifyInvoiceIntegrity(
    localDetails: InvoiceDetails, 
    chainInvoiceHash: AleoField
  ): Promise<boolean> {
    try {
      // 重新计算本地明细的哈希
      const computedHash = await this.computeInvoiceHash(localDetails);
      
      // 清理链上哈希的可见性修饰符（双重保险，防止 parseAleoRecord 未清理）
      const cleanChainHash = chainInvoiceHash.replace(/field\.(private|public)$/, 'field') as AleoField;
      
      // 调试日志
      console.log('🔍 [verifyInvoiceIntegrity] Computed hash:', computedHash);
      console.log('🔍 [verifyInvoiceIntegrity] Chain hash (original):', chainInvoiceHash);
      console.log('🔍 [verifyInvoiceIntegrity] Chain hash (cleaned):', cleanChainHash);
      console.log('🔍 [verifyInvoiceIntegrity] Match:', computedHash === cleanChainHash);
      
      // 对比两个哈希值
      return computedHash === cleanChainHash;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.HASH_MISMATCH,
        'Failed to verify invoice integrity',
        { originalError: error?.message || error }
      );
    }
  }

  /**
   * 获取 Web Crypto API 实例
   */
  private getWebCrypto(): Crypto {
    if (typeof globalThis.crypto !== 'undefined') {
      return globalThis.crypto as Crypto;
    }
    throw new Error('WebCrypto not available in this environment');
  }

  /**
   * 使用 PBKDF2 从字符串密钥派生 32 字节加密密钥
   * 
   * 改进说明：
   * - 使用标准的 PBKDF2 密钥派生函数（Key Derivation Function）
   * - 提供更好的安全性，即使输入密钥较弱也能生成强密钥
   * - 使用固定盐值（在生产环境中应该使用用户特定的盐）
   * 
   * @param masterKey 用户提供的主密钥字符串
   * @returns 32 字节的加密密钥
   */
  private async deriveEncryptionKey(masterKey: string): Promise<Uint8Array> {
    const crypto = this.getWebCrypto();
    
    // 将主密钥转换为 CryptoKey 对象
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(masterKey),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    
    // 使用 PBKDF2 派生密钥
    // 注意：在生产环境中，盐值应该是用户特定的（如从地址派生）
    const salt = new TextEncoder().encode('alpaca-invoice-salt-v1');
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000, // OWASP 推荐至少 100,000 次迭代
        hash: 'SHA-256'
      },
      keyMaterial,
      256 // 256 位 = 32 字节
    );
    
    return new Uint8Array(derivedBits);
  }

  /**
   * 从签名派生主密钥（用于本地加密发票明细）
   * 
   * 使用场景：
   * - 用户首次创建发票时，需要授权访问私有发票数据
   * - 通过签名消息获取签名，然后从此签名派生主密钥
   * - 主密钥用于加密/解密存储在 IndexedDB 中的发票明细
   * 
   * 实现说明：
   * 1. 使用 SHA-256 对签名进行哈希
   * 2. 将哈希结果转换为十六进制字符串
   * 3. 返回该字符串作为 masterKey（后续会使用 PBKDF2 进一步派生加密密钥）
   * 
   * 安全性：
   * - 签名是用户钱包私钥对特定消息的签名，具有唯一性和不可伪造性
   * - 使用 SHA-256 确保密钥的随机性和安全性
   * - 相同的签名总是产生相同的主密钥（确定性派生）
   * 
   * @param signature 钱包签名的消息（来自 signMessage）
   * @returns 主密钥字符串（用于后续加密/解密）
   * @throws {CryptoServiceError} 可能抛出 ENCRYPTION_FAILED
   */
  async deriveMasterKey(signature: string): Promise<string> {
    if (!signature || signature.trim() === '') {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Signature cannot be empty',
        { hint: 'Signature is required to derive master key' }
      );
    }

    try {
      // 获取 Web Crypto API
      const crypto = this.getWebCrypto();

      // 使用 SHA-256 对签名进行哈希
      const encoder = new TextEncoder();
      const signatureBytes = encoder.encode(signature);
      const hashBuffer = await crypto.subtle.digest('SHA-256', signatureBytes);

      // 将 ArrayBuffer 转换为十六进制字符串
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const masterKey = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      return masterKey;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to derive master key from signature',
        { originalError: error }
      );
    }
  }

  /**
   * 验证 Field 值是否在有效范围内
   * 用于测试和调试
   * 
   * @param fieldStr AleoField 格式字符串
   * @returns 是否有效
   */
  public validateFieldValue(fieldStr: AleoField): boolean {
    try {
      // 移除 'field' 后缀
      const numStr = fieldStr.replace(/field$/, '');
      const value = BigInt(numStr);
      
      // 检查是否在有效范围内
      return value >= 0n && value < ALEO_FIELD_MODULUS;
    } catch {
      return false;
    }
  }
}
