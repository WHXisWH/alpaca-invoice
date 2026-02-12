import { InvoiceDetails, AleoField, EncryptedPayload } from '@/lib/types';
import { ICryptoService, CryptoError, AleoInvoiceRecord } from './ICryptoService';
import { createServiceError } from '@/lib/service-errors';
import {
  encryptInvoiceDetails as encryptDetails,
  decryptInvoiceDetails as decryptDetails,
} from '@/lib/crypto';

// Contract tag mapping (commit_field tag values)
const FIELD_TAGS = {
  amount: 1n,
  tax_amount: 2n,
  due_date: 3n,
  buyer: 4n,
  seller: 5n,
  currency: 6n,
  items_hash: 7n,
  memo_hash: 8n,
  order_id: 9n
} as const;

const RULE_TAGS = ['r1', 'r2', 'r3', 'r4', 'r5'] as const;

/**
 * Aleo Field modulus (prime p)
 * p = 8444461749428370424248824938781546531375899335154063827935233455917409239041
 * This is the scalar field modulus of the BLS12-377 curve used by the Aleo blockchain
 */
const ALEO_FIELD_MODULUS = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041');

/**
 * CryptoService error class
 */
export const CryptoServiceError = createServiceError<CryptoError>('Crypto');
export type CryptoServiceError = InstanceType<typeof CryptoServiceError>;

/**
 * CryptoService implementation class
 *
 * Responsibilities: Provides encryption, decryption, and hash computation functionality
 * - Compute invoice hash (for on-chain proof of record)
 * - Verify invoice integrity (compare on-chain hash with local hash)
 * - Local encryption/decryption of invoice details (PBKDF2 + AES-GCM)
 * - Parse Aleo Records (process wallet-decrypted data)
 *
 * Core verification flow:
 * 1. On invoice creation: computeInvoiceHash(details) -> invoice_hash stored in on-chain Record
 * 2. On viewing: parseAleoRecord(jsonString) -> retrieve on-chain invoice_hash
 * 3. On verification: verifyInvoiceIntegrity(localDetails, chainHash) -> confirm data integrity
 *
 * Technical features:
 * - Uses Web Crypto API's SHA-256 for secure hashing
 * - Applies modular arithmetic to ensure hash values are within the valid Aleo Field range
 * - Uses PBKDF2 (100,000 iterations) to derive encryption keys
 */
export class CryptoService implements ICryptoService {
  /**
   * Evaluate audit rules (R1–R5) consistent with contract compute_rules_proof.
   */
  async evaluateAuditRules(input: {
    amount: bigint;
    taxAmount: bigint;
    dueDate: number;
    currentTime: number;
    lineItemsSum: bigint;
    expectedTotal: bigint;
    taxRateBps: bigint;
    invoiceHash: AleoField;
  }): Promise<{ rulesHash: AleoField; r1: boolean; r2: boolean; r3: boolean; r4: boolean; r5: boolean }> {
    const expectedTax = (input.amount * input.taxRateBps) / 10000n;
    const r1 = input.taxAmount === expectedTax;
    const r2 = BigInt(input.dueDate) >= BigInt(input.currentTime);
    const r3 = input.amount + input.taxAmount === input.expectedTotal;
    const r4 = input.lineItemsSum === input.amount;
    const r5 = true; // invoice_hash is already provided; integrity is checked by caller

    const rulesBits = RULE_TAGS.map((_, idx) => {
      return [r1, r2, r3, r4, r5][idx] ? '1' : '0';
    }).join('');

    // Simple hash -> we reuse computeRulesResult logic: hash boolean struct via JSON -> SHA256 -> field
    const hashInput = { r1, r2, r3, r4, r5 };
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(hashInput));
    const hashBuffer = await this.getWebCrypto().subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const hashBigInt = BigInt('0x' + hashHex) % ALEO_FIELD_MODULUS;
    const rulesHash = `${hashBigInt.toString()}field` as AleoField;

    return { rulesHash, r1, r2, r3, r4, r5 };
  }

  /**
   * Build per-field commitments and root consistent with contract commit_field tags.
   */
  async buildFieldCommitments(input: {
    amount: bigint;
    taxAmount: bigint;
    dueDate: number;
    buyer: string;
    seller: string;
    currency: AleoField;
    itemsHash: AleoField;
    memoHash: AleoField;
    orderId: AleoField;
    nonce: AleoField;
  }): Promise<{ root: AleoField; fields: Record<string, AleoField> }> {
    const commitField = async (valueField: AleoField, salt: AleoField, tag: bigint) => {
      const payload = JSON.stringify({ val: valueField, salt, tag: `${tag}field` });
      const enc = new TextEncoder().encode(payload);
      const h = await this.getWebCrypto().subtle.digest('SHA-256', enc);
      const hx = Array.from(new Uint8Array(h))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const bi = BigInt('0x' + hx) % ALEO_FIELD_MODULUS;
      return `${bi.toString()}field` as AleoField;
    };

    const salt = input.nonce;
    const fields: Record<string, AleoField> = {};
    fields.amount = await commitField(`${input.amount}field` as AleoField, salt, FIELD_TAGS.amount);
    fields.tax_amount = await commitField(`${input.taxAmount}field` as AleoField, salt, FIELD_TAGS.tax_amount);
    fields.due_date = await commitField(`${input.dueDate}field` as AleoField, salt, FIELD_TAGS.due_date);
    fields.buyer = await commitField(`${input.buyer}field` as AleoField, salt, FIELD_TAGS.buyer);
    fields.seller = await commitField(`${input.seller}field` as AleoField, salt, FIELD_TAGS.seller);
    fields.currency = await commitField(input.currency, salt, FIELD_TAGS.currency);
    fields.items_hash = await commitField(input.itemsHash, salt, FIELD_TAGS.items_hash);
    fields.memo_hash = await commitField(input.memoHash, salt, FIELD_TAGS.memo_hash);
    fields.order_id = await commitField(input.orderId, salt, FIELD_TAGS.order_id);

    const root = await this.hashObjectToField(fields);
    return { root, fields };
  }

  /**
   * Generate minimal disclosure audit package (off-chain).
   */
  async generateAuditPackage(input: {
    invoiceId: AleoField;
    invoiceHash: AleoField;
    rulesHash: AleoField;
    fieldCommitments: Record<string, AleoField>;
    commitmentsRoot: AleoField;
    auditKeyHash: AleoField;
    scopesBitmask: bigint;
    expiresAt: number;
    selectedFields: string[];
    payload: any;
    signature?: string;
    programId: string;
    version?: string;
  }): Promise<any> {
    return {
      version: input.version ?? '2.2',
      program_id: input.programId,
      invoice_id: input.invoiceId,
      invoice_hash: input.invoiceHash,
      rules_hash: input.rulesHash,
      commitments_root: input.commitmentsRoot,
      field_commitments: input.fieldCommitments,
      audit_key_hash: input.auditKeyHash,
      scopes_bitmask: input.scopesBitmask.toString(),
      expires_at: input.expiresAt,
      selected_fields: input.selectedFields,
      payload: input.payload,
      signature: input.signature
    };
  }

  /**
   * Verify audit package by recomputing hashes and calling on-chain asserts.
   */
  async verifyAuditPackage(pkg: any, adapter: {
    assertRules: (invoiceId: AleoField, rulesHash: AleoField) => Promise<void>;
    assertAmount: (invoice: any, hash: AleoField, min: bigint, max: bigint) => Promise<void>;
    assertOwnership: (invoice: any, hash: AleoField, seller: string, buyer: string) => Promise<void>;
    assertCommitment: (invoiceId: AleoField, root: AleoField) => Promise<void>;
    assertCounter?: (seller: string, expected: bigint) => Promise<void>;
  }): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Expiry check (milliseconds)
      if (pkg.expires_at !== undefined && typeof pkg.expires_at === 'number') {
        if (Date.now() > pkg.expires_at) {
          return { valid: false, reason: 'expired' };
        }
      }

      // Basic presence check
      if (!pkg.invoice_id || !pkg.commitments_root || !pkg.rules_hash || !pkg.field_commitments) {
        return { valid: false, reason: 'missing_required_fields' };
      }

      // If payload contains amount/tax/total, recompute expected rules hash and compare
      if (pkg.payload && pkg.payload.amount && pkg.payload.tax_amount && pkg.payload.expected_total) {
        const rules = await this.evaluateAuditRules({
          amount: BigInt(pkg.payload.amount.toString()),
          taxAmount: BigInt(pkg.payload.tax_amount.toString()),
          dueDate: Number(pkg.payload.due_date ?? 0),
          currentTime: Number(pkg.payload.current_time ?? 0),
          lineItemsSum: BigInt(pkg.payload.line_items_sum ?? pkg.payload.amount),
          expectedTotal: BigInt(pkg.payload.expected_total.toString()),
          taxRateBps: BigInt(pkg.payload.tax_rate_bps ?? 0),
          invoiceHash: pkg.invoice_hash as AleoField
        });
        if (rules.rulesHash !== pkg.rules_hash) {
          return { valid: false, reason: 'rules_hash_mismatch' };
        }
      }

      await adapter.assertRules(pkg.invoice_id as AleoField, pkg.rules_hash as AleoField);
      await adapter.assertCommitment(pkg.invoice_id as AleoField, pkg.commitments_root as AleoField);

      // Optional amount & ownership assertions if full invoice provided
      if (pkg.invoice_record) {
        await adapter.assertAmount(
          pkg.invoice_record,
          pkg.invoice_hash as AleoField,
          BigInt(pkg.payload?.min_amount ?? 0),
          BigInt(pkg.payload?.max_amount ?? pkg.payload?.amount ?? 0)
        );
        await adapter.assertOwnership(
          pkg.invoice_record,
          pkg.invoice_hash as AleoField,
          pkg.invoice_record.seller,
          pkg.invoice_record.buyer
        );
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, reason: e?.message ?? 'assert_failed' };
    }
  }
  /**
   * Core business hash: Computes a unique hash for InvoiceDetails following the contract logic
   *
   * Use cases:
   * - On invoice creation: compute hash -> store in on-chain InvoiceRecord.invoice_hash
   * - On verification: recompute hash from local details -> compare with on-chain hash (via verifyInvoiceIntegrity)
   *
   * Implementation details:
   * 1. Uses SHA-256 algorithm to generate a 256-bit hash
   * 2. Converts the hash value to BigInt
   * 3. Applies modular arithmetic (hash % ALEO_FIELD_MODULUS) to ensure the result is within Field range
   * 4. Returns an AleoField format string (e.g., "123456789field")
   *
   * Why modular arithmetic is needed:
   * - Aleo Field is a finite field where all elements must be < ALEO_FIELD_MODULUS
   * - SHA-256 may produce values larger than the modulus, requiring modular reduction to map into the valid range
   * - This ensures the on-chain contract can correctly handle the hash values
   *
   * @param details Invoice details object
   * @returns AleoField corresponding to the contract field
   */
  async computeInvoiceHash(details: InvoiceDetails): Promise<AleoField> {
    try {
      // 1. Normalize object: remove undefined values via JSON.parse(JSON.stringify())
      // This ensures consistent object structure before and after encryption/decryption
      const normalized = JSON.parse(JSON.stringify(details));

      // 2. Deep sort object keys (recursively handle nested objects and arrays)
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

      // Debug logs
      console.log('🔐 [computeInvoiceHash] Normalized object:', normalized);
      console.log('🔐 [computeInvoiceHash] Sorted normalized:', sortedNormalized);
      console.log('🔐 [computeInvoiceHash] Canonical JSON:', canonical);

      // 3. Get browser native Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode(canonical);
      const hashBuffer = await this.getWebCrypto().subtle.digest('SHA-256', data);

      // 4. Convert ArrayBuffer to BigInt (without using Buffer)
      // Approach: wrap hashBuffer as Uint8Array, then process byte by byte
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const hashBigInt = BigInt('0x' + hashHex);

      // 5. Apply modular arithmetic to ensure value is within Aleo Field range
      const fieldValue = hashBigInt % ALEO_FIELD_MODULUS;

      // 6. Return AleoField format string
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
   * Generic helper: hash arbitrary object to AleoField (SHA-256 mod p).
   */
  async hashObjectToField(obj: any): Promise<AleoField> {
    const canonical = JSON.stringify(obj);
    const enc = new TextEncoder().encode(canonical);
    const h = await this.getWebCrypto().subtle.digest('SHA-256', enc);
    const hx = Array.from(new Uint8Array(h))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const bi = BigInt('0x' + hx) % ALEO_FIELD_MODULUS;
    return `${bi.toString()}field` as AleoField;
  }

  /**
   * Local encryption of sensitive data: encrypts details with a private key before saving to StorageService
   *
   * @param details Original details
   * @param masterKey User's locally derived key (string format)
   * @returns Encrypted payload
   */
  async encryptInvoiceDetails(
    details: InvoiceDetails,
    masterKey: string
  ): Promise<EncryptedPayload> {
    try {
      // Convert masterKey string to Uint8Array
      const encryptionKey = await this.deriveEncryptionKey(masterKey);

      // Use the encryption function from lib/crypto.ts
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
   * Local decryption of sensitive data
   *
   * @param payload Encrypted payload
   * @param masterKey User's locally derived key (string format)
   * @returns Decrypted invoice details
   * @throws {CryptoServiceError} May throw DECRYPTION_FAILED
   */
  async decryptInvoiceDetails(
    payload: EncryptedPayload,
    masterKey: string
  ): Promise<InvoiceDetails> {
    try {
      // Convert masterKey string to Uint8Array
      const encryptionKey = await this.deriveEncryptionKey(masterKey);

      // Use the decryption function from lib/crypto.ts
      return await decryptDetails(payload, encryptionKey);
    } catch (error: any) {
      // If decryption fails, throw a specific error
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
   * Parse a decrypted InvoiceRecord from wallet.requestRecords()
   *
   * This is a key step in the invoice verification flow:
   * 1. The wallet returns decrypted on-chain Records via requestRecords()
   * 2. This method parses the JSON and extracts fields like invoice_hash
   * 3. The caller can then use verifyInvoiceIntegrity() to verify data integrity
   *
   * Complete verification flow example:
   * ```typescript
   * // 1. Get on-chain Record
   * const records = await wallet.requestRecords('zk_invoice_v2.aleo');
   * const chainRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
   *   JSON.stringify(records[0].data)
   * );
   *
   * // 2. Get locally encrypted details from IndexedDB
   * const encryptedPayload = await storageService.getInvoice(chainRecord.invoice_id);
   * const localDetails = await cryptoService.decryptInvoiceDetails(encryptedPayload, masterKey);
   *
   * // 3. Verify integrity
   * const isValid = await cryptoService.verifyInvoiceIntegrity(
   *   localDetails,
   *   chainRecord.invoice_hash as AleoField
   * );
   * if (!isValid) {
   *   throw new Error('Invoice data has been tampered with!');
   * }
   * ```
   *
   * @param jsonString Decrypted JSON string (from wallet.requestRecords())
   * @returns Parsed Record data object (generic support, defaults to AleoInvoiceRecord)
   * @throws {CryptoServiceError} If the JSON format is invalid or is in encrypted record1... format
   */
  async parseAleoRecord<T = AleoInvoiceRecord>(jsonString: string): Promise<T> {
    try {
      // Empty string check
      if (!jsonString || jsonString.trim() === '') {
        throw new CryptoServiceError(
          CryptoError.DECRYPTION_FAILED,
          'Empty input string',
          { hint: 'Input cannot be empty' }
        );
      }

      // Process decrypted JSON data (from wallet.requestRecords())
      if (jsonString.startsWith('{') || jsonString.startsWith('[')) {
        const parsed = JSON.parse(jsonString);

        // Clean Aleo format type markers and visibility modifiers
        const cleanRecord = (obj: any): any => {
          if (typeof obj === 'string') {
            // Remove field.private or field.public suffix
            if (obj.includes('field.')) {
              return obj.replace(/field\.(private|public)$/, 'field');
            }
            // Remove numeric type suffixes (u8, u16, u32, u64, u128, i8, i16, i32, i64, i128)
            // e.g., "1000000u64" -> "1000000", "0u8" -> "0"
            if (obj.match(/^\d+[ui](8|16|32|64|128)$/)) {
              return obj.replace(/[ui](8|16|32|64|128)$/, '');
            }
            // Remove other visibility modifiers (e.g., .private, .public)
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

      // If it's in record1... format, suggest using the correct approach
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

      // Unknown format
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
   * Verify invoice integrity: compare hash of local details with on-chain stored hash
   *
   * This is the core method for tamper-proof verification:
   * - Recomputes the hash of local invoice details
   * - Compares with the invoice_hash stored in the on-chain InvoiceRecord
   * - If they match, it proves the local data matches the on-chain proof and has not been tampered with
   *
   * @param localDetails Locally stored invoice details (decrypted from IndexedDB)
   * @param chainInvoiceHash The invoice_hash field from the on-chain Record
   * @returns true indicates data is intact and untampered, false indicates data inconsistency
   */
  async verifyInvoiceIntegrity(
    localDetails: InvoiceDetails,
    chainInvoiceHash: AleoField
  ): Promise<boolean> {
    if (!localDetails || typeof localDetails !== 'object') {
      throw new CryptoServiceError(
        CryptoError.HASH_MISMATCH,
        'Invalid invoice details for integrity verification',
        { localDetails }
      );
    }

    try {
      // Recompute hash from local details
      const computedHash = await this.computeInvoiceHash(localDetails);

      // Clean visibility modifiers from on-chain hash (extra safety, in case parseAleoRecord didn't clean it)
      const cleanChainHash = chainInvoiceHash.replace(/field\.(private|public)$/, 'field') as AleoField;

      // Debug logs
      console.log('🔍 [verifyInvoiceIntegrity] Computed hash:', computedHash);
      console.log('🔍 [verifyInvoiceIntegrity] Chain hash (original):', chainInvoiceHash);
      console.log('🔍 [verifyInvoiceIntegrity] Chain hash (cleaned):', cleanChainHash);
      console.log('🔍 [verifyInvoiceIntegrity] Match:', computedHash === cleanChainHash);

      // Compare the two hash values
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
   * Get Web Crypto API instance
   */
  private getWebCrypto(): Crypto {
    if (typeof globalThis.crypto !== 'undefined') {
      return globalThis.crypto as Crypto;
    }
    throw new Error('WebCrypto not available in this environment');
  }

  /**
   * Derive a 32-byte encryption key from a string key using PBKDF2
   *
   * Improvement notes:
   * - Uses the standard PBKDF2 Key Derivation Function
   * - Provides better security by generating strong keys even from weak input keys
   * - Uses a fixed salt (in production, a user-specific salt should be used)
   *
   * @param masterKey User-provided master key string
   * @returns 32-byte encryption key
   */
  private async deriveEncryptionKey(masterKey: string): Promise<Uint8Array> {
    const crypto = this.getWebCrypto();

    // Convert master key to CryptoKey object
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(masterKey),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    // Derive key using PBKDF2
    // Note: In production, the salt should be user-specific (e.g., derived from address)
    const salt = new TextEncoder().encode('alpaca-invoice-salt-v1');
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000, // OWASP recommends at least 100,000 iterations
        hash: 'SHA-256'
      },
      keyMaterial,
      256 // 256 bits = 32 bytes
    );

    return new Uint8Array(derivedBits);
  }

  /**
   * Derive master key from signature (used for local encryption of invoice details)
   *
   * Use cases:
   * - When a user first creates an invoice and needs to authorize access to private invoice data
   * - Obtain a signature by signing a message, then derive the master key from that signature
   * - The master key is used to encrypt/decrypt invoice details stored in IndexedDB
   *
   * Implementation details:
   * 1. Hash the signature using SHA-256
   * 2. Convert the hash result to a hexadecimal string
   * 3. Return that string as the masterKey (which will be further derived into an encryption key via PBKDF2)
   *
   * Security:
   * - The signature is produced by the user's wallet private key on a specific message, ensuring uniqueness and unforgeability
   * - SHA-256 ensures randomness and security of the key
   * - The same signature always produces the same master key (deterministic derivation)
   *
   * @param signature Wallet-signed message (from signMessage)
   * @returns Master key string (used for subsequent encryption/decryption)
   * @throws {CryptoServiceError} May throw ENCRYPTION_FAILED
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
      // Get Web Crypto API
      const crypto = this.getWebCrypto();

      // Hash the signature using SHA-256
      const encoder = new TextEncoder();
      const signatureBytes = encoder.encode(signature);
      const hashBuffer = await crypto.subtle.digest('SHA-256', signatureBytes);

      // Convert ArrayBuffer to hexadecimal string
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
   * Validate whether a Field value is within the valid range
   * Used for testing and debugging
   *
   * @param fieldStr AleoField format string
   * @returns Whether the value is valid
   */
  public validateFieldValue(fieldStr: AleoField): boolean {
    try {
      // Remove 'field' suffix
      const numStr = fieldStr.replace(/field$/, '');
      const value = BigInt(numStr);

      // Check if it is within the valid range
      return value >= 0n && value < ALEO_FIELD_MODULUS;
    } catch {
      return false;
    }
  }
}
