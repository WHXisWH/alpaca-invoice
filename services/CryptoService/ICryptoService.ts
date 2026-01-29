// services/CryptoService.ts
import { InvoiceDetails, AleoField, EncryptedPayload } from '@/lib/types';

/** * Crypto error enum */
export enum CryptoError {
  HASH_MISMATCH = 'HASH_MISMATCH',       // Computed hash does not match the on-chain attestation
  DECRYPTION_FAILED = 'DECRYPTION_FAILED', // Decryption failed (usually an incorrect ViewKey)
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED'  // Encryption failed
}

/**
 * Structure of on-chain InvoiceRecord (data decrypted by wallet.requestRecords())
 */
export interface AleoInvoiceRecord {
  owner: string;           // Record owner address
  invoice_id: string;      // Unique invoice ID (Field format)
  invoice_hash: string;    // Invoice details hash (Field format, used for integrity verification)
  amount: string;          // Invoice amount (microcredits)
  seller: string;          // Seller address
  buyer: string;           // Buyer address
  due_date: number;        // Due date (Unix timestamp)
  status: number;          // Status (0=pending, 1=paid, 2=cancelled)
  created_at: number;      // Creation time (Unix timestamp)
  _nonce?: string;         // Record nonce (optional)
}

/**
 * Structure of on-chain PaymentRecord (receipt record generated after payment)
 */
export interface AleoPaymentRecord {
  owner: string;           // Record owner address
  payment_id: string;      // Unique payment ID (Field format)
  invoice_id: string;      // Associated invoice ID (Field format)
  payer: string;           // Payer address
  payee: string;           // Payee address
  amount: string;          // Payment amount (microcredits)
  paid_at: number;         // Payment time (Unix timestamp)
  _nonce?: string;         // Record nonce (optional)
}

/**
 * Union type for on-chain Records (InvoiceRecord or PaymentRecord)
 */
export type AleoRecord = AleoInvoiceRecord | AleoPaymentRecord;

export interface ICryptoService {
  /**
   * Core business hash: compute a unique hash from InvoiceDetails following the contract logic
   *
   * Use cases:
   * 1. When creating an invoice: compute the hash of invoice details and store it in the on-chain InvoiceRecord.invoice_hash
   * 2. When verifying: recompute the hash of local details and compare it with the on-chain hash
   *
   * Uses SHA-256 algorithm with modular arithmetic to ensure the result is within the Aleo Field range
   *
   * @param details Invoice details object
   * @returns AleoField corresponding to the contract field (format: "123...field")
   */
  computeInvoiceHash(details: InvoiceDetails): Promise<AleoField>;

  /**
   * Parse a decrypted InvoiceRecord from wallet.requestRecords()
   *
   * Complete invoice verification flow:
   * ```typescript
   * // 1. Get decrypted on-chain Records from the wallet
   * const records = await wallet.requestRecords('zk_invoice.aleo');
   * const chainRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
   *   JSON.stringify(records[0].data)
   * );
   *
   * // 2. Retrieve locally encrypted details from IndexedDB
   * const encryptedPayload = await storageService.getInvoice(chainRecord.invoice_id);
   * const localDetails = await cryptoService.decryptInvoiceDetails(encryptedPayload, masterKey);
   *
   * // 3. Verify integrity: recompute the hash and compare it with the on-chain hash
   * const isValid = await cryptoService.verifyInvoiceIntegrity(localDetails, chainRecord.invoice_hash);
   * ```
   *
   * @param jsonString Decrypted JSON string (from wallet.requestRecords())
   * @returns Parsed Record data object
   * @throws {CryptoServiceError} If the JSON format is invalid or is in record1... encrypted format
   */
  parseAleoRecord<T = AleoInvoiceRecord>(jsonString: string): Promise<T>;

  /**
   * Verify invoice integrity: compare the hash of local details with the on-chain stored hash
   *
   * @param localDetails Locally stored invoice details (decrypted from IndexedDB)
   * @param chainInvoiceHash The invoice_hash field from the on-chain Record
   * @returns true indicates data is intact and untampered, false indicates data inconsistency
   */
  verifyInvoiceIntegrity(localDetails: InvoiceDetails, chainInvoiceHash: AleoField): Promise<boolean>;

  /**
   * Local encryption: encrypt invoice details and store them in IndexedDB
   * Uses PBKDF2 key derivation + AES-GCM symmetric encryption
   *
   * @param details Original invoice details
   * @param masterKey User's locally derived key (string format)
   * @returns Encrypted payload (containing iv and ciphertext)
   */
  encryptInvoiceDetails(details: InvoiceDetails, masterKey: string): Promise<EncryptedPayload>;

  /**
   * Local decryption: read and decrypt invoice details from IndexedDB
   *
   * @param payload Encrypted payload
   * @param masterKey User's locally derived key
   * @returns Decrypted invoice details
   * @throws {CryptoServiceError} DECRYPTION_FAILED if the key is incorrect or data is corrupted
   */
  decryptInvoiceDetails(payload: EncryptedPayload, masterKey: string): Promise<InvoiceDetails>;

  /**
   * Derive a master key from a signature (used for local encryption of invoice details)
   *
   * Use cases:
   * - When the user creates an invoice for the first time, authorization is needed to access private invoice data
   * - Obtain a signature by signing a message, then derive the master key from the signature
   * - The master key is used to encrypt/decrypt invoice details stored in IndexedDB
   *
   * Implementation notes:
   * 1. Hash the signature using SHA-256
   * 2. Convert the hash result to a hexadecimal string
   * 3. Return the string as the masterKey (PBKDF2 will further derive the encryption key)
   *
   * Security:
   * - The signature is the user's wallet private key signing a specific message, providing uniqueness and non-forgeability
   * - SHA-256 ensures randomness and security of the key
   * - The same signature always produces the same master key (deterministic derivation)
   *
   * @param signature Wallet-signed message (from signMessage)
   * @returns Master key string (used for subsequent encryption/decryption)
   * @throws {CryptoServiceError} May throw ENCRYPTION_FAILED
   */
  deriveMasterKey(signature: string): Promise<string>;
}
