import { createServiceError } from '@/lib/service-errors';
import type { AleoAddress, AleoField, EncryptedPayload, Invoice } from '@/lib/types';
import type { AuditPackageEnvelope } from '@/types/audit-package';
import type { IInvoiceRegistryService } from '@/services/InvoiceRegistryService/IInvoiceRegistryService';

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

/**
 * V2.2: nonce + commitments (for auditor to recompute and verify against chain)
 */
export interface AuditPackageV2_2 {
  version: '2.2';
  programId: string;
  owner: AleoAddress;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  nonce: AleoField;
  cipher: EncryptedPayload;
  commitments: {
    root: AleoField;
    amount?: AleoField;
    taxAmount?: AleoField;
    dueDate?: AleoField;
    buyer?: AleoField;
    seller?: AleoField;
    currency?: AleoField;
    itemsHash?: AleoField;
    memoHash?: AleoField;
    orderId?: AleoField;
  };
  cipherHash: string;
  signature: string;
  expiresAt: number;
  issuedAt: number;
  chainVerifiable: boolean;
}

export type AuditPackage = AuditPackageV1 | AuditPackageV2 | AuditPackageV2_2;

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
 * Generate audit package parameters.
 * Caller must pass the invoice (from local DB/chain) including nonce from invoice creation.
 */
export interface GenerateAuditPackageParams {
  /** Invoice from local DB/chain; must include `details` and `nonce` (from create_invoice). */
  invoice: Invoice;
  expiresAt: number;
  permissions: string[];
  /** When provided, use chain commitment root instead of local build (for auditor verification). */
  chainCommitmentRoot?: AleoField;
  /** When provided, use chain field commitments (snake_case keys). */
  chainFieldCommitments?: Record<string, AleoField>;
  /** When provided, use this audit key instead of generating a new one (from invoice creation). */
  auditKey?: string;
}

/**
 * Generate audit package result (envelope format + key material)
 */
export interface GenerateAuditPackageResult {
  /** New envelope JSON to share with auditor */
  envelope: AuditPackageEnvelope;
  /** Decryption key (hex); give to auditor separately */
  auditKey: string;
  /** Field hash of audit key for set_audit_authorization */
  auditKeyHash: AleoField;
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
 * Generate: caller passes invoice from local DB/chain (including nonce from create_invoice).
 * No getAllInvoices dependency; signing is done via injected signMessage.
 */
export interface IAuditService {
  /**
   * Generate audit package (envelope + audit key + auditKeyHash).
   * Caller must pass the invoice from local DB/chain, with details and nonce.
   *
   * @param params invoice, expiresAt, permissions, optional chain commitments
   * @returns envelope, auditKey, auditKeyHash
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

  /**
   * Validate envelope-format audit package: decrypt and verify integrity + optional chain checks.
   */
  validateEnvelope(envelope: AuditPackageEnvelope, auditKey: string): Promise<ValidateAuditPackageResult>;

  /**
   * Four-phase verification for auditors: pre-check, on-chain access control,
   * chain anchoring, and trustless verification.
  */
  verifyEnvelopePhases(
    envelope: AuditPackageEnvelope,
    auditKey: string,
    registry?: IInvoiceRegistryService
  ): Promise<VerifyEnvelopePhasesResult>;
}

/** Result of each verification phase for UI display. */
export interface VerifyPhaseResult {
  ok: boolean;
  message: string;
  checks?: { key: string; ok: boolean; detail?: string }[];
}

export interface VerifyEnvelopePhasesResult {
  overallValid: boolean;
  phase1: VerifyPhaseResult;
  phase2: VerifyPhaseResult;
  phase3: VerifyPhaseResult;
  phase4: VerifyPhaseResult;
  decrypted?: any;
}
