import type { AleoAddress, AleoField, Invoice, InvoiceDetails, AuditKey } from '@/lib/types';
import { PROGRAM_ID } from '@/lib/contract';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import type { IAleoProtocolService } from '@/services/AleoProtocolService/IAleoProtocolService';
import {
  IAuditService,
  type AuditPackage,
  AuditServiceError,
  AuditError,
  GenerateAuditPackageParams,
  GenerateAuditPackageResult,
  ValidateAuditPackageResult,
  BuildFieldCommitmentsInput,
  GenerateAuditPackageInput,
  AuditVerifyAdapter
} from './IAuditService';

// Contract tag mapping (commit_field tag values) — used by buildFieldCommitments
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

const ALEO_FIELD_MODULUS = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041');

/**
 * Dependencies for AuditService
 */
export interface AuditServiceDependencies {
  /** Wallet public key address */
  signerAddress: AleoAddress | null;
  /** Function to get all invoices */
  getAllInvoices: (options: { masterKey: string; refreshMemory: boolean }) => Promise<Invoice[]>;
  /** Function to sign messages */
  signMessage: (message: string) => Promise<string>;
  /** Optional protocol service for chain verification; when omitted, a real instance is used */
  protocolService?: IAleoProtocolService;
}

/**
 * AuditService implementation class
 *
 * Responsibilities: Encapsulates audit operations and provides a business-layer interface
 *
 * Usage:
 * ```typescript
 * const auditService = new AuditService({
 *   signerAddress,
 *   getAllInvoices,
 *   signMessage
 * });
 * const result = await auditService.generate({...});
 * ```
 *
 * Note:
 * - Master key is derived internally using CryptoService.deriveMasterKey(signature)
 * - Signature is obtained by signing a deterministic message with the wallet
 */
export class AuditService implements IAuditService {
  private deps: AuditServiceDependencies;
  private cryptoService: CryptoService;
  private protocolService: IAleoProtocolService;

  constructor(deps: AuditServiceDependencies) {
    this.deps = deps;
    this.cryptoService = new CryptoService();
    this.protocolService = deps.protocolService ?? new AleoProtocolService();
  }

  /**
   * Derive master key from wallet signature
   * Uses a deterministic message to ensure the same master key is always generated
   */
  private async deriveMasterKey(): Promise<string> {
    try {
      // Use a deterministic message for master key derivation
      const message = `Derive master key for Aleo address: ${this.deps.signerAddress}`;
      const signature = await this.deps.signMessage(message);
      const masterKey = await this.cryptoService.deriveMasterKey(signature);
      return masterKey;
    } catch (error: any) {
      throw new AuditServiceError(
        AuditError.GENERATION_FAILED,
        'Failed to derive master key',
        { originalError: error.message || error }
      );
    }
  }

  /**
   * Filter invoice fields by permission scope
   */
  private filterDetailsByPermissions(invoice: Invoice, permissions: string[]): Partial<Invoice> {
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

  /**
   * Build canonical audit message for signing
   */
  private buildAuditMessage(input: {
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
      input.programId || PROGRAM_ID,
      input.invoiceId,
      input.invoiceHash,
      input.expiresAt,
      sortedPerms,
      input.cipherHash
    ].join('|');
  }

  /**
   * Create audit package with encrypted invoice data
   * 
   * Internal orchestration method that:
   * 1. Filters invoice data by permissions
   * 2. Encrypts filtered data with audit key
   * 3. Generates cipher hash
   * 4. Creates canonical message and signs it
   * 5. Assembles complete audit package
   * 
   * @private
   */
  private async createPackage(params: {
    invoice: Invoice;
    permissions: string[];
    expiresAt: number;
    auditKey: string;
  }): Promise<{ pkg: AuditPackage; key: AuditKey }> {
    const { invoice, permissions, expiresAt, auditKey } = params;

    try {
      // 1. Filter invoice data by permissions
      const filtered = this.filterDetailsByPermissions(invoice, permissions);
      if (!filtered.details && !filtered.amount && !filtered.seller && !filtered.buyer) {
        throw new AuditServiceError(
          AuditError.INVALID_INPUT,
          'No data selected for disclosure',
          { hint: 'Please choose at least one permission' }
        );
      }

      // 2. Encrypt filtered data using CryptoService
      const keyBytes = this.cryptoService.auditKeyToBytes(auditKey);
      const cipher = await this.cryptoService.encryptWithAuditKey(filtered as any, keyBytes);
      
      // 3. Generate cipher hash using CryptoService
      const cipherHash = await this.cryptoService.hashCipher(cipher);
      
      // 4. Build and sign canonical message
      const message = this.buildAuditMessage({
        invoiceId: invoice.id,
        invoiceHash: invoice.invoiceHash,
        expiresAt,
        permissions,
        cipherHash,
        programId: PROGRAM_ID,
        version: 2
      });
      const signature = await this.deps.signMessage(message);

      // 5. Assemble audit package
      const issuedAt = Date.now();
      const pkg: AuditPackage = {
        version: 2,
        programId: PROGRAM_ID,
        invoiceId: invoice.id,
        invoiceHash: invoice.invoiceHash,
        permissions,
        expiresAt,
        issuedAt,
        signerAddress: this.deps.signerAddress!,
        cipher,
        cipherHash,
        signature,
        chainVerifiable: true
      };

      const key: AuditKey = {
        key: auditKey,
        config: {
          invoiceIds: [invoice.id],
          permissions,
          expiresAt
        },
        signature,
        issuedAt
      };

      return { pkg, key };
    } catch (error: any) {
      // Already an AuditServiceError, rethrow directly
      if (error instanceof AuditServiceError) {
        throw error;
      }

      // Wrap other errors
      throw new AuditServiceError(
        AuditError.GENERATION_FAILED,
        'Failed to create audit package',
        { originalError: error.message || error }
      );
    }
  }

  /**
   * Generate audit package
   */
  async generate(params: GenerateAuditPackageParams): Promise<GenerateAuditPackageResult> {
    const { invoiceId, expiresAt, permissions } = params;

    // Validate input parameters
    if (!invoiceId || !invoiceId.trim()) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'Invoice ID is required',
        { hint: 'Please enter a valid invoice ID' }
      );
    }

    // Validate dependencies
    if (!this.deps.signerAddress) {
      throw new AuditServiceError(
        AuditError.NOT_CONNECTED,
        'Wallet not connected. Please connect your wallet first.'
      );
    }

    try {
      // Derive master key from wallet signature
      const masterKey = await this.deriveMasterKey();

      // Get invoice from local storage
      const invoices = await this.deps.getAllInvoices({
        masterKey,
        refreshMemory: false
      });

      const invoice =
        invoices.find((inv: Invoice) => inv.id === invoiceId) ||
        invoices.find((inv: Invoice) => inv.invoiceHash === invoiceId);

      if (!invoice) {
        throw new AuditServiceError(
          AuditError.INVOICE_NOT_FOUND,
          'Invoice not found in local storage',
          { hint: 'Please sync invoices first or check the invoice ID' }
        );
      }

      if (!invoice.details) {
        throw new AuditServiceError(
          AuditError.MISSING_DETAILS,
          'Invoice details are missing; cannot generate audit package.',
          { invoiceId }
        );
      }

      // Generate audit key using CryptoService
      const auditKey = this.cryptoService.generateAuditKey();

      // Create audit package (using internal method)
      const { pkg } = await this.createPackage({
        invoice,
        permissions,
        expiresAt,
        auditKey
      });

      return { pkg, auditKey };
    } catch (error: any) {
      // Already an AuditServiceError, rethrow directly
      if (error instanceof AuditServiceError) {
        throw error;
      }

      // Wrap other errors
      throw new AuditServiceError(
        AuditError.GENERATION_FAILED,
        'Failed to generate audit package',
        { originalError: error.message || error }
      );
    }
  }

  /**
   * Validate audit package
   */
  async validate(pkg: AuditPackage, auditKey: string): Promise<ValidateAuditPackageResult> {
    try {
      if (Date.now() > pkg.expiresAt) {
        return { valid: false, reason: 'Audit package expired' };
      }

      const recomputedHash = await this.cryptoService.hashCipher(pkg.cipher);
      if (recomputedHash !== pkg.cipherHash) {
        return { valid: false, reason: 'Cipher hash mismatch (tampered payload)' };
      }

      let decrypted: any;
      try {
        const keyBytes = this.cryptoService.auditKeyToBytes(auditKey);
        decrypted = await this.cryptoService.decryptWithRawKey(pkg.cipher, keyBytes);
      } catch {
        return { valid: false, reason: 'Failed to decrypt payload with provided audit key' };
      }

      const targetHash = pkg.invoiceHash;
      if (targetHash && decrypted?.details) {
        const hash = await this.cryptoService.computeInvoiceHash(decrypted.details);
        const cleanChainHash = targetHash.replace(/field\.(private|public)$/, 'field');
        if (hash !== cleanChainHash) {
          return { valid: false, reason: 'Decrypted details do not match invoice_hash' };
        }
      }

      if (pkg.version === 2 && pkg.chainVerifiable && this.protocolService) {
        const chain = await this.protocolService.verifyInvoiceOnChain(pkg.invoiceId, pkg.invoiceHash);
        if (!chain.exists) {
          return { valid: false, reason: 'INVOICE_NOT_FOUND_ON_CHAIN', decrypted };
        }
        if (!chain.hashMatch) {
          return {
            valid: false,
            reason: 'HASH_MISMATCH_WITH_CHAIN',
            decrypted,
            chainVerification: {
              invoiceExistsOnChain: chain.exists,
              hashMatchesChain: chain.hashMatch,
              chainStatus: chain.chainStatus ?? null
            }
          };
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
    } catch (error: any) {
      throw new AuditServiceError(
        AuditError.VALIDATION_FAILED,
        'Failed to validate audit package',
        { originalError: error.message || error }
      );
    }
  }

  /** Web Crypto for field commitments (SHA-256). */
  private getWebCrypto(): Crypto {
    if (typeof globalThis.crypto !== 'undefined') return globalThis.crypto as Crypto;
    throw new Error('WebCrypto not available');
  }

  /** Hash object to AleoField (SHA-256 mod p). */
  private async hashObjectToField(obj: Record<string, unknown>): Promise<AleoField> {
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
   * Build commitments root and field commitments aligned with contract tags.
   */
  async buildFieldCommitments(input: BuildFieldCommitmentsInput): Promise<{ root: AleoField; fields: Record<string, AleoField> }> {
    const commitField = async (valueField: AleoField, salt: AleoField, tag: bigint): Promise<AleoField> => {
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
   * Generate audit package (minimal disclosure) with proofs/anchors.
   */
  async generateAuditPackage(input: GenerateAuditPackageInput): Promise<any> {
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
   * Verify audit package by recomputing and calling on-chain anchors via provided protocol adapter.
   */
  async verifyAuditPackage(pkg: any, adapter: AuditVerifyAdapter): Promise<{ valid: boolean; reason?: string }> {
    try {
      // expires_at may be in seconds (Unix) or ms; treat as seconds if value is small (< 1e12)
      if (pkg.expires_at !== undefined && typeof pkg.expires_at === 'number') {
        const now = pkg.expires_at >= 1e12 ? Date.now() : Math.floor(Date.now() / 1000);
        if (now > pkg.expires_at) {
          return { valid: false, reason: 'expired' };
        }
      }

      if (!pkg.invoice_id || !pkg.commitments_root || !pkg.rules_hash || !pkg.field_commitments) {
        return { valid: false, reason: 'missing_required_fields' };
      }

      if (pkg.payload && pkg.payload.amount && pkg.payload.tax_amount && pkg.payload.expected_total) {
        const rules = await this.cryptoService.evaluateAuditRules({
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
}
