import type { AleoAddress, AleoField, Invoice, InvoiceDetails, AuditKey } from '@/lib/types';
import { PROGRAM_ID } from '@/lib/contract';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import type { IAleoProtocolService } from '@/services/AleoProtocolService/IAleoProtocolService';
import {
  IAuditService,
  type AuditPackage,
  type AuditPackageV2_2,
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

// Map snake_case (from buildFieldCommitments) to camelCase (for commitments JSON)
const SNAKE_TO_CAMEL: Record<string, keyof AuditPackageV2_2['commitments']> = {
  amount: 'amount',
  tax_amount: 'taxAmount',
  due_date: 'dueDate',
  buyer: 'buyer',
  seller: 'seller',
  currency: 'currency',
  items_hash: 'itemsHash',
  memo_hash: 'memoHash',
  order_id: 'orderId'
};

// Permissions -> which commitment fields to include
function getDisclosedCommitmentKeys(permissions: string[]): (keyof AuditPackageV2_2['commitments'])[] {
  const keys = new Set<keyof AuditPackageV2_2['commitments']>();
  if (permissions.includes('READ_AMOUNT')) keys.add('amount');
  if (permissions.includes('READ_TAX')) keys.add('taxAmount');
  if (permissions.includes('READ_PARTIES')) {
    keys.add('buyer');
    keys.add('seller');
  }
  if (permissions.includes('READ_DETAILS')) {
    keys.add('dueDate');
    keys.add('currency');
    keys.add('itemsHash');
    keys.add('memoHash');
    keys.add('orderId');
  }
  return [...keys];
}

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
   * V2.2: AUDIT_PACKAGE_V2_2|programId|invoiceId|invoiceHash|nonce|root|expiresAt|sortedPerms|cipherHash
   */
  private buildAuditMessage(input: {
    invoiceId: AleoField;
    invoiceHash: AleoField;
    nonce?: AleoField;
    root?: AleoField;
    expiresAt: number;
    permissions: string[];
    cipherHash: string;
    programId?: string;
    version?: number | '2.2';
  }): string {
    const sortedPerms = [...input.permissions].sort().join(',');
    if (input.version === '2.2' && input.nonce && input.root) {
      return [
        'AUDIT_PACKAGE_V2_2',
        input.programId || PROGRAM_ID,
        input.invoiceId,
        input.invoiceHash,
        input.nonce,
        input.root,
        input.expiresAt,
        sortedPerms,
        input.cipherHash
      ].join('|');
    }
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
   * Create audit package with encrypted invoice data (V2.2)
   *
   * Internal orchestration method that:
   * 1. Filters invoice data by permissions
   * 2. Builds field commitments (nonce + disclosed fields)
   * 3. Encrypts filtered data with audit key
   * 4. Generates cipher hash and signs canonical message
   * 5. Assembles complete audit package with nonce, commitments
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
      const nonce = (invoice as Invoice & { nonce?: AleoField }).nonce;
      if (!nonce) {
        throw new AuditServiceError(
          AuditError.INVALID_INPUT,
          'Invoice nonce is required for audit package (auditor needs it to recompute commitments)',
          { hint: 'Invoice must have nonce from create_invoice' }
        );
      }

      // 1. Filter invoice data by permissions
      const filtered = this.filterDetailsByPermissions(invoice, permissions);
      if (!filtered.details && !filtered.amount && !filtered.seller && !filtered.buyer) {
        throw new AuditServiceError(
          AuditError.INVALID_INPUT,
          'No data selected for disclosure',
          { hint: 'Please choose at least one permission' }
        );
      }

      // 2. Build field commitments (root + per-field)
      const toSeconds = (d: Date) => Math.floor(d.getTime() / 1000);
      const { root, fields } = await this.buildFieldCommitments({
        amount: invoice.amount,
        taxAmount: invoice.taxAmount ?? 0n,
        dueDate: toSeconds(invoice.dueDate),
        buyer: invoice.buyer,
        seller: invoice.seller,
        currency: invoice.currency ?? ('0field' as AleoField),
        itemsHash: invoice.itemsHash ?? ('0field' as AleoField),
        memoHash: invoice.memoHash ?? ('0field' as AleoField),
        orderId: invoice.orderId ?? ('0field' as AleoField),
        nonce
      });

      const disclosedKeys = getDisclosedCommitmentKeys(permissions);
      const commitments: AuditPackageV2_2['commitments'] = { root };
      for (const key of disclosedKeys) {
        if (key === 'root') continue;
        const snakeKey = Object.entries(SNAKE_TO_CAMEL).find(([, v]) => v === key)?.[0] ?? key;
        const val = fields[snakeKey as keyof typeof fields];
        if (val) commitments[key] = val;
      }

      // 3. Encrypt filtered data using CryptoService
      const keyBytes = this.cryptoService.auditKeyToBytes(auditKey);
      const cipher = await this.cryptoService.encryptWithAuditKey(filtered as any, keyBytes);

      // 4. Generate cipher hash and sign canonical message
      const cipherHash = await this.cryptoService.hashCipher(cipher);
      const message = this.buildAuditMessage({
        invoiceId: invoice.id,
        invoiceHash: invoice.invoiceHash,
        nonce,
        root,
        expiresAt,
        permissions,
        cipherHash,
        programId: PROGRAM_ID,
        version: '2.2'
      });
      const signature = await this.deps.signMessage(message);

      // 5. Assemble V2.2 audit package
      const issuedAt = Date.now();
      const pkg: AuditPackageV2_2 = {
        version: '2.2',
        programId: PROGRAM_ID,
        owner: this.deps.signerAddress!,
        invoiceId: invoice.id,
        invoiceHash: invoice.invoiceHash,
        permissions,
        nonce,
        cipher,
        commitments,
        cipherHash,
        signature,
        expiresAt,
        issuedAt,
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
      if (error instanceof AuditServiceError) throw error;
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

      const isChainVerifiable = (pkg.version === 2 || pkg.version === '2.2') && pkg.chainVerifiable && this.protocolService;
      if (isChainVerifiable) {
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

  /**
   * Build commitments root and field commitments aligned with contract tags.
   * Uses BHP768 (commit_field) and Poseidon8 (root) via @provablehq/sdk.
   * Field commitments match Leo commit_field(val, salt, tag); root uses Poseidon
   * (for exact chain root, fetch via get_invoice_commitment).
   */
  async buildFieldCommitments(input: BuildFieldCommitmentsInput): Promise<{ root: AleoField; fields: Record<string, AleoField> }> {
    const { commitField, computeCommitmentRoot } = await import('./commitmentUtils');
    const salt = input.nonce;
    const fields: Record<string, AleoField> = {};
    fields.amount = commitField(`${input.amount}field` as AleoField, salt, `${FIELD_TAGS.amount}field` as AleoField);
    fields.tax_amount = commitField(`${input.taxAmount}field` as AleoField, salt, `${FIELD_TAGS.tax_amount}field` as AleoField);
    fields.due_date = commitField(`${input.dueDate}field` as AleoField, salt, `${FIELD_TAGS.due_date}field` as AleoField);
    fields.buyer = commitField(input.buyer, salt, `${FIELD_TAGS.buyer}field` as AleoField);
    fields.seller = commitField(input.seller, salt, `${FIELD_TAGS.seller}field` as AleoField);
    fields.currency = commitField(input.currency, salt, `${FIELD_TAGS.currency}field` as AleoField);
    fields.items_hash = commitField(input.itemsHash, salt, `${FIELD_TAGS.items_hash}field` as AleoField);
    fields.memo_hash = commitField(input.memoHash, salt, `${FIELD_TAGS.memo_hash}field` as AleoField);
    fields.order_id = commitField(input.orderId, salt, `${FIELD_TAGS.order_id}field` as AleoField);

    const root = computeCommitmentRoot(fields);
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
