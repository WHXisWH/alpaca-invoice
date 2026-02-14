'use client';

import { Buffer } from 'buffer';
import type {
  AleoAddress,
  AleoField,
  EncryptedPayload,
  Invoice,
  InvoiceDetails,
  InvoiceStatus
} from './types';
import { decryptInvoiceDetails } from './crypto';
import { PROGRAM_ID as DEFAULT_PROGRAM_ID } from './contract';
import type { IAleoProtocolService } from '@/services/AleoProtocolService/IAleoProtocolService';

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
  cipherHash: string; // sha256(iv + ciphertext) hex
  signature: string; // wallet signature over canonical string
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

function getWebCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined') return globalThis.crypto as Crypto;
  throw new Error('WebCrypto not available');
}

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomAuditKey(): string {
  const cryptoImpl = getWebCrypto();
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('hex');
}

export function auditKeyToBytes(key: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(key) || key.length < 32) {
    throw new Error('Invalid audit key format');
  }
  return new Uint8Array(Buffer.from(key, 'hex'));
}

export async function hashCipher(payload: EncryptedPayload): Promise<string> {
  const cryptoImpl = getWebCrypto();
  const concat = Buffer.concat([
    Buffer.from(payload.iv, 'base64'),
    Buffer.from(payload.ciphertext, 'base64')
  ]);
  const digest = await cryptoImpl.subtle.digest('SHA-256', concat);
  return toHex(digest);
}

export function filterDetailsByPermissions(
  invoice: Invoice,
  permissions: string[]
): Partial<Invoice> {
  const allow = (perm: string) => permissions.includes(perm);
  const base: Partial<Invoice> = {
    id: invoice.id,
    invoiceHash: invoice.invoiceHash,
    seller: allow('READ_PARTIES') ? invoice.seller : undefined,
    buyer: allow('READ_PARTIES') ? invoice.buyer : undefined,
    amount: allow('READ_AMOUNT') ? invoice.amount : undefined,
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt,
    status: invoice.status
  };

  if (invoice.details && allow('READ_DETAILS')) {
    base.details = invoice.details;
  } else if (invoice.details && allow('READ_AMOUNT')) {
    // Minimal financial subset if details are restricted
    base.details = {
      invoiceNumber: invoice.details.invoiceNumber,
      subtotal: invoice.details.subtotal,
      taxRate: invoice.details.taxRate,
      taxAmount: invoice.details.taxAmount,
      total: invoice.details.total,
      currency: invoice.details.currency,
      lineItems: allow('READ_LINE_ITEMS') ? invoice.details.lineItems : []
    } as InvoiceDetails;
  }

  return base;
}

export function buildAuditMessage(input: {
  invoiceId: AleoField;
  invoiceHash: AleoField;
  expiresAt: number;
  permissions: string[];
  cipherHash: string;
  programId?: string;
  version?: number;
}): string {
  const sortedPerms = [...input.permissions].sort().join(',');
  return [
    input.version === 2 ? 'AUDIT_PACKAGE_V2' : 'AUDIT_PACKAGE_V1',
    input.programId || DEFAULT_PROGRAM_ID,
    input.invoiceId,
    input.invoiceHash,
    input.expiresAt,
    sortedPerms,
    input.cipherHash
  ].join('|');
}

export async function validateAuditPackage(params: {
  pkg: AuditPackage;
  auditKey: string;
  expectedInvoiceHash?: AleoField;
  computeInvoiceHash: (details: InvoiceDetails) => Promise<AleoField>;
  protocolService?: IAleoProtocolService;
}): Promise<{
  valid: boolean;
  reason?: string;
  decrypted?: any;
  chainVerification?: {
    invoiceExistsOnChain: boolean;
    hashMatchesChain: boolean;
    chainStatus: InvoiceStatus | null;
  };
}> {
  const { pkg, auditKey, expectedInvoiceHash, computeInvoiceHash, protocolService } = params;

  if (Date.now() > pkg.expiresAt) {
    return { valid: false, reason: 'Audit package expired' };
  }

  // Recompute cipher hash
  const recomputedHash = await hashCipher(pkg.cipher);
  if (recomputedHash !== pkg.cipherHash) {
    return { valid: false, reason: 'Cipher hash mismatch (tampered payload)' };
  }

  // Decrypt
  let decrypted: any;
  try {
    const keyBytes = auditKeyToBytes(auditKey);
    decrypted = await decryptInvoiceDetails(pkg.cipher, keyBytes);
  } catch (err: any) {
    return { valid: false, reason: 'Failed to decrypt payload with provided audit key' };
  }

  // Integrity check against invoice_hash
  const targetHash = pkg.invoiceHash || expectedInvoiceHash;
  if (targetHash && decrypted?.details) {
    const hash = await computeInvoiceHash(decrypted.details);
    const cleanChainHash = targetHash.replace(/field\.(private|public)$/, 'field');
    if (hash !== cleanChainHash) {
      return { valid: false, reason: 'Decrypted details do not match invoice_hash' };
    }
  } else if (expectedInvoiceHash) {
    const hash = await computeInvoiceHash(decrypted.details || decrypted);
    if (hash !== expectedInvoiceHash) {
      return { valid: false, reason: 'Invoice hash mismatch' };
    }
  }

  // Optional chain verification for version 2 packages
  if (pkg.version === 2 && pkg.chainVerifiable && protocolService) {
    const chain = await protocolService.verifyInvoiceOnChain(pkg.invoiceId, pkg.invoiceHash);
    if (!chain.exists) {
      return { valid: false, reason: 'INVOICE_NOT_FOUND_ON_CHAIN', decrypted };
    }
    if (!chain.hashMatch) {
      return { valid: false, reason: 'HASH_MISMATCH_WITH_CHAIN', decrypted, chainVerification: {
        invoiceExistsOnChain: chain.exists,
        hashMatchesChain: chain.hashMatch,
        chainStatus: chain.chainStatus ?? null
      }};
    }
    return {
      valid: true,
      decrypted,
      chainVerification: {
        invoiceExistsOnChain: chain.exists,
        hashMatchesChain: chain.hashMatch,
        chainStatus: chain.chainStatus ?? null
      }
    };
  }

  return { valid: true, decrypted };
}
