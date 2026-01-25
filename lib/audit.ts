'use client';

import { Buffer } from 'buffer';
import type {
  AleoAddress,
  AleoField,
  AuditKey,
  AuditKeyConfig,
  EncryptedPayload,
  Invoice,
  InvoiceDetails
} from './types';
import { encryptInvoiceDetails, decryptInvoiceDetails } from './crypto';

/**
 * Audit package schema (versioned for forward compatibility)
 */
export interface AuditPackage {
  version: 1;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  expiresAt: number;
  auditorAddress: AleoAddress;
  issuedAt: number;
  signerAddress: AleoAddress;
  cipher: EncryptedPayload;
  cipherHash: string; // sha256(iv + ciphertext) hex
  signature: string; // wallet signature over canonical string
}

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
  auditorAddress: AleoAddress;
  expiresAt: number;
  permissions: string[];
  cipherHash: string;
}): string {
  const sortedPerms = [...input.permissions].sort().join(',');
  return [
    'AUDIT_PACKAGE_V1',
    input.invoiceId,
    input.invoiceHash,
    input.auditorAddress,
    input.expiresAt,
    sortedPerms,
    input.cipherHash
  ].join('|');
}

export async function createAuditPackage(params: {
  invoice: Invoice;
  permissions: string[];
  auditorAddress: AleoAddress;
  expiresAt: number;
  signerAddress: AleoAddress;
  auditKey: string;
  signMessage: (message: string) => Promise<string>;
}): Promise<{ pkg: AuditPackage; key: AuditKey }> {
  const { invoice, permissions, auditorAddress, expiresAt, signerAddress, auditKey, signMessage } =
    params;

  const filtered = filterDetailsByPermissions(invoice, permissions);
  if (!filtered.details && !filtered.amount && !filtered.seller && !filtered.buyer) {
    throw new Error('No data selected for disclosure. Please choose at least one permission.');
  }

  const keyBytes = auditKeyToBytes(auditKey);
  const cipher = await encryptInvoiceDetails(filtered as any, keyBytes);
  const cipherHash = await hashCipher(cipher);
  const message = buildAuditMessage({
    invoiceId: invoice.id,
    invoiceHash: invoice.invoiceHash,
    auditorAddress,
    expiresAt,
    permissions,
    cipherHash
  });
  const signature = await signMessage(message);

  const pkg: AuditPackage = {
    version: 1,
    invoiceId: invoice.id,
    invoiceHash: invoice.invoiceHash,
    permissions,
    expiresAt,
    auditorAddress,
    issuedAt: Date.now(),
    signerAddress,
    cipher,
    cipherHash,
    signature
  };

  const key: AuditKey = {
    key: auditKey,
    config: {
      invoiceIds: [invoice.id],
      permissions,
      expiresAt,
      auditorAddress
    },
    signature,
    issuedAt: pkg.issuedAt
  };

  return { pkg, key };
}

export async function validateAuditPackage(params: {
  pkg: AuditPackage;
  auditKey: string;
  expectedInvoiceHash?: AleoField;
  computeInvoiceHash: (details: InvoiceDetails) => Promise<AleoField>;
}): Promise<{
  valid: boolean;
  reason?: string;
  decrypted?: any;
}> {
  const { pkg, auditKey, expectedInvoiceHash, computeInvoiceHash } = params;

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
  if (pkg.invoiceHash && decrypted?.details) {
    const hash = await computeInvoiceHash(decrypted.details);
    const cleanChainHash = pkg.invoiceHash.replace(/field\.(private|public)$/, 'field');
    if (hash !== cleanChainHash) {
      return { valid: false, reason: 'Decrypted details do not match on-chain invoice_hash' };
    }
  } else if (expectedInvoiceHash) {
    const hash = await computeInvoiceHash(decrypted.details || decrypted);
    if (hash !== expectedInvoiceHash) {
      return { valid: false, reason: 'Invoice hash mismatch' };
    }
  }

  return { valid: true, decrypted };
}
