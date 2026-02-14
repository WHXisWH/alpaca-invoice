import { createServiceError } from '@/lib/service-errors';
import type { AleoAddress, AleoField, EncryptedPayload, Invoice } from '@/lib/types';

/**
 * Audit package schema (versioned for forward compatibility)
 */
export interface AuditPackageV1 {
  version: 1;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  expiresAt: number;
  issuedAt: number;
  signerAddress: AleoAddress;
  cipher: EncryptedPayload;
  cipherHash: string;
  signature: string;
}

export interface AuditPackageV2 {
  version: 2;
  programId: string;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  expiresAt: number;
  issuedAt: number;
  signerAddress: AleoAddress;
  cipher: EncryptedPayload;
  cipherHash: string;
  signature: string;
  chainVerifiable: boolean;
}

export type AuditPackage = AuditPackageV1 | AuditPackageV2;

/**
 * Audit service error codes
 */
export enum AuditError {
  NOT_CONNECTED = 'NOT_CONNECTED',           // Wallet not connected
  MISSING_MASTER_KEY = 'MISSING_MASTER_KEY', // Master key not available
  INVALID_INPUT = 'INVALID_INPUT',           // Invalid or missing input parameters
  INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',   // Invoice not found in local storage
  MISSING_DETAILS = 'MISSING_DETAILS',       // Invoice details are missing
  INVALID_PACKAGE = 'INVALID_PACKAGE',       // Audit package validation failed
  GENERATION_FAILED = 'GENERATION_FAILED',   // Failed to generate audit package
  VALIDATION_FAILED = 'VALIDATION_FAILED',   // Failed to validate audit package
  SIGN_NOT_SUPPORTED = 'SIGN_NOT_SUPPORTED'  // Wallet does not support signMessage
}

/**
 * Audit service error class
 */
export const AuditServiceError = createServiceError<AuditError>('AuditService');
export type AuditServiceError = InstanceType<typeof AuditServiceError>;

/**
 * Generate audit package parameters
 */
export interface GenerateAuditPackageParams {
  invoiceId: AleoField;
  expiresAt: number;
  permissions: string[];
}

/**
 * Generate audit package result
 */
export interface GenerateAuditPackageResult {
  pkg: AuditPackage;
  auditKey: string;
}

/**
 * Validate audit package result
 */
export interface ValidateAuditPackageResult {
  valid: boolean;
  reason?: string;
  decrypted?: any;
  chainVerification?: {
    invoiceExistsOnChain: boolean;
    hashMatchesChain: boolean;
    chainStatus: any;
  };
}

/**
 * Protocol adapter for audit package verification (on-chain assertions).
 */
export interface AuditVerifyAdapter {
  assertRules: (invoiceId: AleoField, rulesHash: AleoField) => Promise<void>;
  assertAmount: (invoice: any, hash: AleoField, min: bigint, max: bigint) => Promise<void>;
  assertOwnership: (invoice: any, hash: AleoField, seller: string, buyer: string) => Promise<void>;
  assertCommitment: (invoiceId: AleoField, root: AleoField) => Promise<void>;
  assertCounter?: (seller: string, expected: bigint) => Promise<void>;
}

/**
 * Input for building field commitments.
 */
export interface BuildFieldCommitmentsInput {
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
}

/**
 * Input for generating an audit package (minimal disclosure with proofs/anchors).
 */
export interface GenerateAuditPackageInput {
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
}

/**
 * IAuditService interface
 * Responsibility: Encapsulate audit operations, handle generation and validation of audit packages
 * 
 * Note:
 * - Master key is derived internally using CryptoService.deriveMasterKey(signature)
 * - Signature is obtained from wallet by signing a deterministic message
 */
export interface IAuditService {
  /**
   * Generate audit package
   * 
   * Process:
   * 1. Validates input parameters (invoiceId)
   * 2. Derives master key from wallet signature (using CryptoService)
   * 3. Retrieves and decrypts invoice from local storage
   * 4. Creates audit package with specified permissions
   * 
   * @param params Generation parameters
   * @returns Generated audit package and audit key
   * @throws {AuditServiceError} May throw various audit errors
   */
  generate(params: GenerateAuditPackageParams): Promise<GenerateAuditPackageResult>;

  /**
   * Validate audit package
   * @param pkg Audit package to validate
   * @param auditKey Audit key for validation
   * @returns Validation result
   * @throws {AuditServiceError} May throw VALIDATION_FAILED
   */
  validate(pkg: AuditPackage, auditKey: string): Promise<ValidateAuditPackageResult>;

  /**
   * Build commitments root and field commitments aligned with contract tags.
   */
  buildFieldCommitments(input: BuildFieldCommitmentsInput): Promise<{ root: AleoField; fields: Record<string, AleoField> }>;

  /**
   * Generate audit package (minimal disclosure) with proofs/anchors.
   */
  generateAuditPackage(input: GenerateAuditPackageInput): Promise<any>;

  /**
   * Verify audit package by recomputing and calling on-chain anchors via provided protocol adapter.
   */
  verifyAuditPackage(pkg: any, adapter: AuditVerifyAdapter): Promise<{ valid: boolean; reason?: string }>;
}
