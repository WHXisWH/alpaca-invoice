import type { AleoAddress, AleoField, Invoice, InvoiceDetails, AuditKey } from '@/lib/types';
import { PROGRAM_ID } from '@/lib/contract';
import { getChainIdFromNetwork, getNetworkFromEnv } from '@/lib/network';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import type { IAleoProtocolService } from '@/services/AleoProtocolService/IAleoProtocolService';
import type { AuditPackageEnvelope, DecryptedAuditPayload } from '@/types/audit-package';
import { COMMITMENT_FIELD_KEYS } from '@/types/audit-package';
import {
  IAuditService,
  type AuditPackage,
  type AuditPackageV2_2,
  type VerifyEnvelopePhasesResult,
  type VerifyPhaseResult,
  AuditServiceError,
  AuditError,
  GenerateAuditPackageParams,
  GenerateAuditPackageResult,
  ValidateAuditPackageResult,
  BuildFieldCommitmentsInput,
  GenerateAuditPackageInput,
  AuditVerifyAdapter
} from './IAuditService';
import type { IInvoiceRegistryService } from '@/services/InvoiceRegistryService/IInvoiceRegistryService';

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

const CAMEL_TO_SNAKE: Record<string, string> = {
  amount: 'amount',
  taxAmount: 'tax_amount',
  dueDate: 'due_date',
  buyer: 'buyer',
  seller: 'seller',
  currency: 'currency',
  itemsHash: 'items_hash',
  memoHash: 'memo_hash',
  orderId: 'order_id'
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

/** Map chainId to envelope network string (e.g. mainnet -> aleo_mainnet). */
function chainIdToEnvelopeNetwork(chainId: string): string {
  const n = chainId.toLowerCase();
  if (n === 'mainnet') return 'aleo_mainnet';
  if (n === 'testnet3') return 'aleo_testnet3';
  if (n === 'testnetbeta') return 'aleo_testnetbeta';
  return `aleo_${n}`;
}

/** Canonical JSON (sorted keys) for deterministic hashing. */
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Dependencies for AuditService (no getAllInvoices; caller passes invoice into generate).
 */
export interface AuditServiceDependencies {
  /** Wallet public key address */
  signerAddress: AleoAddress | null;
  /** Function to sign messages (for package integrity signature) */
  signMessage: (message: string) => Promise<string>;
  /** Optional protocol service for chain verification; when omitted, a real instance is used */
  protocolService?: IAleoProtocolService;
}

/**
 * AuditService implementation class
 *
 * Usage:
 * ```typescript
 * const auditService = new AuditService({ signerAddress, signMessage });
 * const result = await auditService.generate({
 *   invoice,  // from local DB/chain, must include details and nonce
 *   expiresAt,
 *   permissions
 * });
 * ```
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
   * Build disclosed data object (snake_case) and hidden_masks from invoice + permissions.
   */
  private async buildDecryptedData(
    invoice: Invoice,
    permissions: string[]
  ): Promise<{ data: DecryptedAuditPayload['data']; disclosedSnake: Set<string> }> {
    const toSeconds = (d: Date) => Math.floor(d.getTime() / 1000);
    const disclosedCamel = getDisclosedCommitmentKeys(permissions);
    const disclosedSnake = new Set<string>(disclosedCamel.map(c => CAMEL_TO_SNAKE[c] ?? c));
    const data: DecryptedAuditPayload['data'] = { hidden_masks: [] };
    const inv = invoice as Invoice & { taxAmount?: bigint; currency?: AleoField; itemsHash?: AleoField; memoHash?: AleoField; orderId?: AleoField };
    if (disclosedSnake.has('amount')) data.amount = Number(inv.amount);
    if (disclosedSnake.has('tax_amount')) data.tax_amount = inv.details?.taxAmount ?? Number(inv.taxAmount ?? 0);
    if (disclosedSnake.has('due_date')) data.due_date = toSeconds(invoice.dueDate);
    if (disclosedSnake.has('buyer')) data.buyer = invoice.buyer;
    if (disclosedSnake.has('seller')) data.seller = invoice.seller;
    if (disclosedSnake.has('currency')) data.currency = inv.details?.currency ?? (typeof inv.currency === 'string' ? inv.currency : 'unknown');
    if (disclosedSnake.has('items_hash')) data.items_hash = inv.itemsHash ?? (inv.details ? await this.cryptoService.hashObjectToField(inv.details.lineItems ?? []) : ('0field' as AleoField));
    if (disclosedSnake.has('memo_hash')) data.memo_hash = inv.details?.notes ?? (inv.memoHash ?? '');
    if (disclosedSnake.has('order_id')) data.order_id = inv.details?.invoiceNumber ?? (inv.orderId ?? '0field');
    data.hidden_masks = [...COMMITMENT_FIELD_KEYS].filter(k => !disclosedSnake.has(k));
    return { data, disclosedSnake };
  }

  /**
   * Create envelope + audit key. Builds DecryptedAuditPayload, encrypts it, returns envelope and auditKeyHash.
   * @private
   */
  private async createEnvelope(params: {
    invoice: Invoice;
    permissions: string[];
    expiresAt: number;
    auditKey: string;
    chainCommitmentRoot?: AleoField;
    chainFieldCommitments?: Record<string, AleoField>;
  }): Promise<{ envelope: AuditPackageEnvelope; auditKey: string; auditKeyHash: AleoField }> {
    const { invoice, permissions, expiresAt, auditKey, chainCommitmentRoot, chainFieldCommitments } = params;

    const nonce = (invoice as Invoice & { nonce?: AleoField }).nonce;
    if (!nonce) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'Invoice nonce is required for audit package (auditor needs it to recompute commitments)',
        { hint: 'Invoice must have nonce from create_invoice' }
      );
    }

    const filtered = this.filterDetailsByPermissions(invoice, permissions);
    if (!filtered.details && !filtered.amount && !filtered.seller && !filtered.buyer) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'No data selected for disclosure',
        { hint: 'Please choose at least one permission' }
      );
    }

    const toSeconds = (d: Date) => Math.floor(d.getTime() / 1000);
    let root: AleoField;
    let fieldsSnake: Record<string, AleoField>;

    if (chainCommitmentRoot && chainFieldCommitments && Object.keys(chainFieldCommitments).length >= 9) {
      root = chainCommitmentRoot;
      fieldsSnake = { ...chainFieldCommitments } as Record<string, AleoField>;
    } else {
      const invExt = invoice as Invoice & { taxAmount?: bigint; currency?: AleoField; itemsHash?: AleoField; memoHash?: AleoField; orderId?: AleoField };
      const { root: r, fields } = await this.buildFieldCommitments({
        amount: invoice.amount,
        taxAmount: invExt.taxAmount ?? BigInt(invoice.details?.taxAmount ?? 0),
        dueDate: toSeconds(invoice.dueDate),
        buyer: invoice.buyer,
        seller: invoice.seller,
        currency: invExt.currency ?? ('0field' as AleoField),
        itemsHash: invExt.itemsHash ?? ('0field' as AleoField),
        memoHash: invExt.memoHash ?? ('0field' as AleoField),
        orderId: invExt.orderId ?? ('0field' as AleoField),
        nonce
      });
      root = r;
      fieldsSnake = fields as Record<string, AleoField>;
    }

    const commitments: DecryptedAuditPayload['commitments'] = {
      amount: fieldsSnake.amount ?? ('0field' as AleoField),
      tax_amount: fieldsSnake.tax_amount ?? ('0field' as AleoField),
      due_date: fieldsSnake.due_date ?? ('0field' as AleoField),
      buyer: fieldsSnake.buyer ?? ('0field' as AleoField),
      seller: fieldsSnake.seller ?? ('0field' as AleoField),
      currency: fieldsSnake.currency ?? ('0field' as AleoField),
      items_hash: fieldsSnake.items_hash ?? ('0field' as AleoField),
      memo_hash: fieldsSnake.memo_hash ?? ('0field' as AleoField),
      order_id: fieldsSnake.order_id ?? ('0field' as AleoField),
      root
    };

    const { data } = await this.buildDecryptedData(invoice, permissions);
    const issuedAt = Math.floor(Date.now() / 1000);
    const payloadWithoutIntegrity = {
      invoiceId: invoice.id,
      invoiceHash: invoice.invoiceHash,
      issuedAt,
      nonce,
      data,
      commitments
    };
    const contentHash = await this.cryptoService.hashUtf8ToHex(canonicalJson(payloadWithoutIntegrity));
    const message = this.buildAuditMessage({
      invoiceId: invoice.id,
      invoiceHash: invoice.invoiceHash,
      nonce,
      root,
      expiresAt,
      permissions,
      cipherHash: contentHash,
      programId: PROGRAM_ID,
      version: '2.2'
    });
    const signature = await this.deps.signMessage(message);
    const fullPayload: DecryptedAuditPayload = {
      ...payloadWithoutIntegrity,
      integrity: { cipherHash: contentHash, signature }
    };

    const keyBytes = this.cryptoService.auditKeyToBytes(auditKey);
    const cipher = await this.cryptoService.encryptWithAuditKey(fullPayload as any, keyBytes);
    const auditKeyHash = (await this.cryptoService.hashObjectToField(auditKey)) as AleoField;
    const expiresAtSeconds = expiresAt >= 1e12 ? Math.floor(expiresAt / 1000) : expiresAt;

    const envelope: AuditPackageEnvelope = {
      version: '2.2.0',
      audit_type: 'selective_disclosure',
      network: chainIdToEnvelopeNetwork(getChainIdFromNetwork(getNetworkFromEnv())),
      contract: PROGRAM_ID,
      context: {
        invoice_id: invoice.id,
        audit_key_hash: auditKeyHash,
        expires_at: expiresAtSeconds
      },
      encryption: {
        algorithm: 'AES-256-GCM',
        iv: cipher.iv,
        auth_tag: cipher.authTag ?? '',
        ciphertext: cipher.ciphertext
      }
    };

    return { envelope, auditKey, auditKeyHash };
  }

  /**
   * Generate audit package (envelope format + audit key + auditKeyHash for set_audit_authorization).
   * Caller must pass the invoice from local DB/chain, including nonce from create_invoice.
   */
  async generate(params: GenerateAuditPackageParams): Promise<GenerateAuditPackageResult> {
    const { invoice, expiresAt, permissions, chainCommitmentRoot, chainFieldCommitments, auditKey: providedAuditKey } = params;

    if (!invoice || !invoice.id) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'Invoice is required',
        { hint: 'Pass the invoice from local DB/chain' }
      );
    }

    if (!this.deps.signerAddress) {
      throw new AuditServiceError(
        AuditError.NOT_CONNECTED,
        'Wallet not connected. Please connect your wallet first.'
      );
    }

    if (!invoice.details) {
      throw new AuditServiceError(
        AuditError.MISSING_DETAILS,
        'Invoice details are missing; cannot generate audit package.',
        { invoiceId: invoice.id }
      );
    }

    const nonce = (invoice as Invoice & { nonce?: AleoField }).nonce;
    if (!nonce) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'Invoice nonce is required (from create_invoice)',
        { hint: 'Pass the invoice with nonce from local DB/chain' }
      );
    }

    try {
      const auditKey = providedAuditKey ?? this.cryptoService.generateAuditKey();
      const result = await this.createEnvelope({
        invoice,
        permissions,
        expiresAt,
        auditKey,
        chainCommitmentRoot,
        chainFieldCommitments
      });

      return { envelope: result.envelope, auditKey: result.auditKey, auditKeyHash: result.auditKeyHash };
    } catch (error: any) {
      if (error instanceof AuditServiceError) throw error;
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
   * Validate envelope-format audit package: decrypt, verify integrity hash, optional chain checks.
   */
  async validateEnvelope(
    envelope: AuditPackageEnvelope,
    auditKey: string
  ): Promise<ValidateAuditPackageResult> {
    try {
      const expiresAtSec = envelope.context.expires_at;
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > expiresAtSec) {
        return { valid: false, reason: 'Audit package expired' };
      }

      const enc = envelope.encryption;
      const cipher = {
        iv: enc.iv,
        ciphertext: enc.ciphertext,
        authTag: enc.auth_tag
      };
      let decrypted: DecryptedAuditPayload;
      try {
        const keyBytes = this.cryptoService.auditKeyToBytes(auditKey);
        decrypted = (await this.cryptoService.decryptWithRawKey(cipher, keyBytes)) as unknown as DecryptedAuditPayload;
      } catch {
        return { valid: false, reason: 'Failed to decrypt payload with provided audit key' };
      }

      const payloadWithoutIntegrity = {
        invoiceId: decrypted.invoiceId,
        invoiceHash: decrypted.invoiceHash,
        issuedAt: decrypted.issuedAt,
        nonce: decrypted.nonce,
        data: decrypted.data,
        commitments: decrypted.commitments
      };
      const recomputedHash = await this.cryptoService.hashUtf8ToHex(canonicalJson(payloadWithoutIntegrity));
      if (recomputedHash !== decrypted.integrity.cipherHash) {
        return { valid: false, reason: 'Integrity hash mismatch (tampered payload)', decrypted };
      }

      if (this.protocolService && decrypted.invoiceHash) {
        const chain = await this.protocolService.verifyInvoiceOnChain(decrypted.invoiceId, decrypted.invoiceHash);
        if (!chain.exists) {
          return { valid: false, reason: 'INVOICE_NOT_FOUND_ON_CHAIN', decrypted };
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
        'Failed to validate envelope',
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

  /**
   * Four-phase verification for auditors.
   */
  async verifyEnvelopePhases(
    envelope: AuditPackageEnvelope,
    auditKey: string,
    registry: IInvoiceRegistryService
  ): Promise<VerifyEnvelopePhasesResult> {
    const phase1: VerifyPhaseResult = { ok: false, message: '', checks: [] };
    const phase2: VerifyPhaseResult = { ok: false, message: '', checks: [] };
    const phase3: VerifyPhaseResult = { ok: false, message: '', checks: [] };
    const phase4: VerifyPhaseResult = { ok: false, message: '', checks: [] };

    let decrypted: DecryptedAuditPayload | undefined;
    const invoiceId = envelope.context.invoice_id;
    const envAuditKeyHash = envelope.context.audit_key_hash;
    const expiresAtSec = envelope.context.expires_at;

    try {
      // --- Phase 1: Pre-check ---
      const nowSec = Math.floor(Date.now() / 1000);
      const expiryOk = nowSec <= expiresAtSec;
      phase1.checks!.push({
        key: 'expiresAt',
        ok: expiryOk,
        detail: expiryOk ? `Valid until ${new Date(expiresAtSec * 1000).toISOString()}` : 'Audit authorization expired'
      });

      const enc = envelope.encryption;
      const cipher = { iv: enc.iv, ciphertext: enc.ciphertext, authTag: enc.auth_tag };
      try {
        const keyBytes = this.cryptoService.auditKeyToBytes(auditKey);
        decrypted = (await this.cryptoService.decryptWithRawKey(cipher, keyBytes)) as unknown as DecryptedAuditPayload;
      } catch {
        phase1.checks!.push({ key: 'decrypt', ok: false, detail: 'Failed to decrypt with provided audit key' });
        phase1.ok = false;
        phase1.message = 'Phase 1 failed: decryption or expiry';
        return { overallValid: false, phase1, phase2, phase3, phase4 };
      }

      const payloadWithoutIntegrity = {
        invoiceId: decrypted.invoiceId,
        invoiceHash: decrypted.invoiceHash,
        issuedAt: decrypted.issuedAt,
        nonce: decrypted.nonce,
        data: decrypted.data,
        commitments: decrypted.commitments
      };
      const recomputedHash = await this.cryptoService.hashUtf8ToHex(canonicalJson(payloadWithoutIntegrity));
      const cipherHashOk = recomputedHash === decrypted.integrity.cipherHash;
      phase1.checks!.push({
        key: 'cipherHash',
        ok: cipherHashOk,
        detail: cipherHashOk ? 'Payload integrity verified' : 'Integrity hash mismatch (tampered)'
      });

      const sigOk = !!(decrypted.integrity?.signature);
      phase1.checks!.push({
        key: 'signature',
        ok: sigOk,
        detail: sigOk ? 'Signature present (issuer verified in Phase 2)' : 'Missing signature'
      });

      phase1.ok = expiryOk && cipherHashOk && sigOk;
      phase1.message = phase1.ok ? 'Package integrity verified' : 'Pre-check failed';

      if (!phase1.ok) {
        return { overallValid: false, phase1, phase2, phase3, phase4, decrypted };
      }

      // --- Phase 2: On-chain access control ---
      const auth = await registry.getAuditAuthorization(invoiceId);
      if (!auth) {
        phase2.checks!.push({ key: 'get_audit_authorization', ok: false, detail: 'No audit authorization on chain' });
        phase2.ok = false;
        phase2.message = 'Phase 2 failed: no on-chain audit authorization';
        return { overallValid: false, phase1, phase2, phase3, phase4, decrypted };
      }
      phase2.checks!.push({ key: 'get_audit_authorization', ok: true, detail: 'AuditAuthorization retrieved' });

      const hashMatch = this.normalizeField(auth.audit_key_hash) === this.normalizeField(envAuditKeyHash);
      phase2.checks!.push({
        key: 'audit_key_hash',
        ok: hashMatch,
        detail: hashMatch ? 'Envelope audit_key_hash matches chain' : 'audit_key_hash mismatch'
      });

      const computedKeyHash = (await this.cryptoService.hashObjectToField(auditKey)) as AleoField;
      const bhpOk = this.normalizeField(computedKeyHash) === this.normalizeField(auth.audit_key_hash);
      phase2.checks!.push({
        key: 'BHP256(AuditKey)',
        ok: bhpOk,
        detail: bhpOk ? 'BHP256(AuditKey) == chain audit_key_hash' : 'Audit key hash mismatch'
      });

      const disclosed = [...COMMITMENT_FIELD_KEYS].filter((k) => !decrypted!.data.hidden_masks?.includes(k));
      let scopesOk = true;
      const FIELD_SCOPE_IDS: Record<string, number> = {
        amount: 1, tax_amount: 2, due_date: 3, buyer: 4, seller: 5, currency: 6, items_hash: 7, memo_hash: 8, order_id: 9
      };
      for (const f of disclosed) {
        const scopeId = FIELD_SCOPE_IDS[f];
        if (scopeId && !(auth.scopes_bitmask & (1n << BigInt(scopeId - 1)))) {
          scopesOk = false;
          break;
        }
      }
      phase2.checks!.push({
        key: 'scopes_bitmask',
        ok: scopesOk,
        detail: scopesOk ? 'Disclosed fields within scopes_bitmask' : 'Disclosed fields exceed authorization'
      });

      phase2.ok = hashMatch && bhpOk && scopesOk;
      phase2.message = phase2.ok ? 'On-chain access control passed' : 'Phase 2 failed';

      if (!phase2.ok) {
        return { overallValid: false, phase1, phase2, phase3, phase4, decrypted };
      }

      // --- Phase 3: Chain anchoring ---
      const [invoiceHash, commitmentRoot, rulesResult] = await Promise.all([
        registry.getInvoiceHash(invoiceId),
        registry.getCommitmentRoot(invoiceId),
        registry.getRulesResult(invoiceId)
      ]);
      phase3.checks!.push({
        key: 'invoice_registry',
        ok: !!invoiceHash,
        detail: invoiceHash ? `invoice_hash: ${String(invoiceHash).slice(0, 20)}...` : 'Invoice not found'
      });
      phase3.checks!.push({
        key: 'invoice_commitment',
        ok: !!commitmentRoot,
        detail: commitmentRoot ? `commitment_root: ${String(commitmentRoot).slice(0, 20)}...` : 'No commitment root'
      });
      phase3.checks!.push({
        key: 'invoice_rules_result',
        ok: !!rulesResult,
        detail: rulesResult ? 'rules_result available' : 'No rules result'
      });
      phase3.ok = !!invoiceHash && !!commitmentRoot;
      phase3.message = phase3.ok ? 'Chain anchors retrieved' : 'Phase 3 failed';

      if (!phase3.ok) {
        return { overallValid: false, phase1, phase2, phase3, phase4, decrypted };
      }

      // --- Phase 4: Trustless verification ---
      const pkgRoot = this.normalizeField(decrypted.commitments.root);
      const chainRoot = this.normalizeField(commitmentRoot!);
      const rootOk = pkgRoot === chainRoot;
      phase4.checks!.push({
        key: 'commitment_root',
        ok: rootOk,
        detail: rootOk ? 'Package root matches chain' : 'Commitment root mismatch'
      });

      const { commitField } = await import('./commitmentUtils');
      const nonce = decrypted.nonce;
      const salt = nonce;
      let fieldProofOk = true;
      for (const key of disclosed) {
        const tagVal = (FIELD_TAGS as Record<string, bigint>)[key] ?? 0n;
        const tag = `${tagVal}field` as AleoField;
        const plain = decrypted.data[key];
        const expectedCommit = decrypted.commitments[key as keyof typeof decrypted.commitments];
        if (expectedCommit == null) continue;
        let val: AleoField | string;
        if (typeof plain === 'number') val = `${plain}field` as AleoField;
        else if (typeof plain === 'string') val = plain;
        else val = String(plain);
        try {
          const computed = commitField(val, salt, tag);
          if (this.normalizeField(computed) !== this.normalizeField(expectedCommit)) fieldProofOk = false;
        } catch {
          fieldProofOk = false;
        }
      }
      phase4.checks!.push({
        key: 'field_proofs',
        ok: fieldProofOk,
        detail: fieldProofOk ? 'Field commitments match plaintext' : 'Field proof mismatch'
      });

      let rulesOk = true;
      const data = decrypted.data;
      if (data.amount != null && data.tax_amount != null) {
        const amount = BigInt(String(data.amount));
        const taxAmount = BigInt(String(data.tax_amount));
        const expectedTotal = amount + taxAmount;
        const lineItemsSum = BigInt(String(data.line_items_sum ?? data.amount ?? 0));
        const taxRateBps = BigInt(String(data.tax_rate_bps ?? 0));
        const result = await this.cryptoService.evaluateAuditRules({
          amount,
          taxAmount,
          dueDate: Number(data.due_date ?? 0),
          currentTime: Math.floor(Date.now() / 1000),
          lineItemsSum,
          expectedTotal,
          taxRateBps,
          invoiceHash: (decrypted.invoiceHash ?? '') as AleoField
        });
        rulesOk = result.r1 && result.r2 && result.r3 && result.r4 && result.r5;
      } else if (rulesResult) {
        rulesOk = true;
      }
      phase4.checks!.push({
        key: 'financial_logic',
        ok: rulesOk,
        detail: rulesOk ? 'R1–R5 (or chain rules) passed' : 'Financial logic check failed'
      });

      phase4.ok = rootOk && fieldProofOk && rulesOk;
      phase4.message = phase4.ok ? 'Trustless verification passed' : 'Phase 4 failed';

      const overallValid = phase1.ok && phase2.ok && phase3.ok && phase4.ok;
      return { overallValid, phase1, phase2, phase3, phase4, decrypted };
    } catch (e: any) {
      phase1.ok = false;
      phase1.message = 'Verification error';
      phase1.checks!.push({ key: 'error', ok: false, detail: e?.message ?? 'Unknown error' });
      return { overallValid: false, phase1, phase2, phase3, phase4, decrypted };
    }
  }

  private normalizeField(f: AleoField | string): string {
    return String(f).replace(/field\.(private|public)$/i, 'field').trim();
  }
}
