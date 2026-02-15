import type { AleoAddress, AleoField } from '@/lib/types';
import type { InvoiceStatus } from '@/lib/types';

/**
 * Business service specifically responsible for querying zk_invoice_v2_2.aleo contract state
 */
export interface IInvoiceRegistryService {
  // --- Basic Information Queries ---
  getInvoiceHash(invoiceId: AleoField): Promise<AleoField | null>;
  getInvoiceStatus(invoiceId: AleoField): Promise<InvoiceStatus | null>;

  // --- Wave 2.2 Audit Core Anchors ---
  /** Get the commitment root of an invoice for auditors to compare against locally recalculated root */
  getCommitmentRoot(invoiceId: AleoField): Promise<AleoField | null>;

  /** Get the pre-stored FieldCommitments on-chain (for auditing package commitments comparison) */
  getFieldCommitments(invoiceId: AleoField): Promise<Record<string, AleoField> | null>;

  /** Get the pre-validation rules result on-chain (R1-R5) */
  getRulesResult(invoiceId: AleoField): Promise<AleoField | null>;

  /** Get the audit authorization information registered on-chain for this invoice (scopes, expires_at) */
  getAuditAuthorization(invoiceId: AleoField): Promise<{
    audit_key_hash: AleoField;
    scopes_bitmask: bigint;
    expires_at: number;
    issuer: AleoAddress;
  } | null>;

  // --- Counters and Statistics ---
  getInvoiceCount(seller: AleoAddress): Promise<number>;
  getAuditCounter(seller: AleoAddress): Promise<number>;
}
