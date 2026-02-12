import { describe, it, expect } from 'vitest';
import { validateAuditPackage, auditKeyToBytes, hashCipher } from '@/lib/audit';
import { InvoiceStatus, type AuditPackageV2, type InvoiceDetails } from '@/lib/types';
import { encryptInvoiceDetails } from '@/lib/crypto';

const dummyDetails: InvoiceDetails = {
  invoiceNumber: 'INV-1',
  lineItems: [],
  subtotal: 0,
  taxRate: 0,
  taxAmount: 0,
  total: 0,
  currency: 'CREDITS'
};

const makePkg = async (overrides: Partial<AuditPackageV2> = {}): Promise<AuditPackageV2> => {
  const auditKeyHex = '0'.repeat(64);
  const keyBytes = auditKeyToBytes(auditKeyHex);
  const plaintext = overrides.permissions ? { details: dummyDetails, permissions: overrides.permissions } : { details: dummyDetails };
  const cipher = overrides.cipher ?? (await encryptInvoiceDetails(plaintext as any, keyBytes));
  const cipherHash = overrides.cipherHash ?? await hashCipher(cipher);
  return {
    version: 2,
    programId: 'zk_invoice_v2.aleo',
    invoiceId: '123field',
    invoiceHash: '999field',
    permissions: ['READ_AMOUNT'],
  expiresAt: Date.now() + 60_000,
  auditorAddress: 'aleo1auditorauditorauditorauditorauditorauditoraud' as any,
  issuedAt: Date.now(),
  signerAddress: 'aleo1signersignersignersignersignersignersigner' as any,
    cipher,
    cipherHash,
  signature: 'sig',
  chainVerifiable: true,
  ...overrides
  };
};

describe('audit.validateAuditPackage', () => {
  it('fails when chain hash mismatch', async () => {
    const pkg = await makePkg();
    const protocolService = {
      verifyInvoiceOnChain: async () => ({
        exists: true,
        hashMatch: false,
        chainStatus: InvoiceStatus.PENDING
      })
    } as any;

    const result = await validateAuditPackage({
      pkg,
      auditKey: '0'.repeat(64),
      protocolService,
      computeInvoiceHash: async () => '999field',
      expectedInvoiceHash: '999field'
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('HASH_MISMATCH_WITH_CHAIN');
  });

  it('passes when chain matches and hash matches', async () => {
    const pkg = await makePkg();
    const protocolService = {
      verifyInvoiceOnChain: async () => ({
        exists: true,
        hashMatch: true,
        chainStatus: InvoiceStatus.PAID
      })
    } as any;

    const result = await validateAuditPackage({
      pkg,
      auditKey: '0'.repeat(64),
      protocolService,
      computeInvoiceHash: async () => '999field',
      expectedInvoiceHash: '999field'
    });

    expect(result.valid).toBe(true);
    expect(result.chainVerification?.chainStatus).toBe(InvoiceStatus.PAID);
  });
});
