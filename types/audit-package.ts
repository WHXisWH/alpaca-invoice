import type { AleoAddress, AleoField } from '@/lib/types';

/**
 * Minimal disclosure audit package for zk_invoice_v2_2.aleo
 * This is an off-chain bundle that references on-chain anchors (rules_result, commitments root, audit authorization).
 */
export interface AuditPackageV22 {
  version: '2.2';
  program_id: string;
  invoice_id: AleoField;
  invoice_hash: AleoField;
  rules_hash: AleoField;
  commitments_root: AleoField;
  field_commitments: Record<string, AleoField>;
  audit_key_hash: AleoField;
  scopes_bitmask: string; // decimal string
  expires_at: number; // unix millis
  selected_fields: string[];
  payload: Record<string, unknown>;
  signature?: string;
  issuer?: AleoAddress;
  auditor?: AleoAddress;
}

export type AuditPackage = AuditPackageV22;

/** All 9 commitment field names (snake_case, matches contract). */
export const COMMITMENT_FIELD_KEYS = [
  'amount',
  'tax_amount',
  'due_date',
  'buyer',
  'seller',
  'currency',
  'items_hash',
  'memo_hash',
  'order_id'
] as const;

/**
 * Envelope JSON for selective disclosure audit package (v2.2.0).
 * This is the format shared with auditors; decryption yields DecryptedAuditPayload.
 */
export interface AuditPackageEnvelope {
  version: '2.2.0';
  audit_type: 'selective_disclosure';
  network: string;
  contract: string;
  context: {
    invoice_id: AleoField;
    audit_key_hash: AleoField;
    expires_at: number; // Unix seconds
  };
  encryption: {
    algorithm: 'AES-256-GCM';
    iv: string;
    auth_tag: string;
    ciphertext: string;
  };
}

/**
 * Decrypted audit payload (what the auditor sees after decrypting the envelope).
 * Matches the structure used for integrity hashing and chain verification.
 */
export interface DecryptedAuditPayload {
  invoiceId: AleoField;
  invoiceHash?: AleoField; // for chain hash verification
  issuedAt: number; // Unix seconds
  nonce: AleoField;
  data: {
    [key: string]: unknown;
    hidden_masks: string[];
  };
  commitments: {
    amount: AleoField;
    tax_amount: AleoField;
    due_date: AleoField;
    buyer: AleoField;
    seller: AleoField;
    currency: AleoField;
    items_hash: AleoField;
    memo_hash: AleoField;
    order_id: AleoField;
    root: AleoField;
  };
  integrity: {
    cipherHash: string;
    signature: string;
  };
}
