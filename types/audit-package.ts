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
