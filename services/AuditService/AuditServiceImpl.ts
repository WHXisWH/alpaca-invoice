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
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';

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
  private registry: IInvoiceRegistryService;

  constructor(deps: AuditServiceDependencies) {
    this.deps = deps;
    this.cryptoService = new CryptoService();
    this.protocolService = deps.protocolService ?? new AleoProtocolService();
    this.registry = createInvoiceRegistryService(this.protocolService as any);
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
        orderId: invoice.details.orderId ?? invoice.details.invoiceNumber,
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
    if (disclosedSnake.has('order_id')) data.order_id = inv.details?.orderId ?? (inv.orderId ?? '0field');
    // Rules R1/R4 need tax_rate_bps and line_items_sum for Phase 5 to match chain rules_result
    if (disclosedSnake.has('amount')) {
      data.line_items_sum = Number(inv.amount);
    }
    if (disclosedSnake.has('amount') || disclosedSnake.has('tax_amount')) {
      data.tax_rate_bps = Number(this.cryptoService.calculateTaxBps(invoice.details?.taxRate ?? 0));
    }
    data.hidden_masks = [...COMMITMENT_FIELD_KEYS].filter(k => !disclosedSnake.has(k));
    return { data, disclosedSnake };
  }

  /**
   * Create envelope + audit key. Builds DecryptedAuditPayload, encrypts it, returns envelope and auditKeyHash.
   * @private
   */
  /** Sentinel nonce for chain-anchored packages (no local nonce; verify only compares package to chain). */
  private static readonly CHAIN_ANCHORED_NONCE = '0field' as AleoField;

  private async createEnvelope(params: {
    invoice: Invoice;
    permissions: string[];
    expiresAt: number;
    auditKey: string;
    chainCommitmentRoot?: AleoField;
    chainFieldCommitments?: Record<string, AleoField>;
    /** When true, use chain root/fields and sentinel nonce (for invoices without nonce from chain sync). */
    useChainAnchored?: boolean;
  }): Promise<{ envelope: AuditPackageEnvelope; auditKey: string; auditKeyHash: AleoField }> {
    const { invoice, permissions, expiresAt, auditKey, chainCommitmentRoot, chainFieldCommitments, useChainAnchored } = params;

    const invoiceNonce = (invoice as Invoice & { nonce?: AleoField }).nonce;
    const nonce: AleoField =
      useChainAnchored && chainCommitmentRoot
        ? AuditService.CHAIN_ANCHORED_NONCE
        : invoiceNonce!;
    if (!nonce) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'Invoice nonce is required for audit package (auditor needs it to recompute commitments)',
        { hint: 'Invoice must have nonce from create_invoice, or use chain-anchored package when commitment_root is on chain' }
      );
    }

    const filtered = this.filterDetailsByPermissions(invoice, permissions);
    const hasAnyDisclosure = !!(filtered.details || filtered.amount != null || filtered.seller || filtered.buyer);
    if (!hasAnyDisclosure) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'No data selected for disclosure',
        { hint: 'Please choose at least one permission' }
      );
    }

    const toSeconds = (d: Date) => Math.floor(d.getTime() / 1000);
    let root: AleoField;
    let fieldsSnake: Record<string, AleoField>;

    if (useChainAnchored && chainCommitmentRoot) {
      root = chainCommitmentRoot;
      fieldsSnake = (chainFieldCommitments && Object.keys(chainFieldCommitments).length >= 9)
        ? { ...chainFieldCommitments } as Record<string, AleoField>
        : {
            amount: '0field', tax_amount: '0field', due_date: '0field', buyer: '0field', seller: '0field',
            currency: '0field', items_hash: '0field', memo_hash: '0field', order_id: '0field'
          } as Record<string, AleoField>;
    } else if (chainCommitmentRoot && chainFieldCommitments && Object.keys(chainFieldCommitments).length >= 9) {
      root = chainCommitmentRoot;
      fieldsSnake = { ...chainFieldCommitments } as Record<string, AleoField>;
    } else {
      const invExt = invoice as Invoice & { taxAmount?: bigint; currency?: AleoField; itemsHash?: AleoField; memoHash?: AleoField; orderId?: AleoField };
      const { root: r, fields } = await this.buildFieldCommitments({
        amount: invoice.amount,
        taxAmount: invExt.taxAmount ?? BigInt(Math.round(Number(invoice.details?.taxAmount ?? 0))),
        dueDate: toSeconds(invoice.dueDate),
        buyer: invoice.buyer,
        seller: invoice.seller,
        currency: invExt.currency ?? ('0field' as AleoField),
        itemsHash: invExt.itemsHash ?? ('0field' as AleoField),
        memoHash: invExt.memoHash ?? ('0field' as AleoField),
        orderId: invExt.orderId ?? ('0field' as AleoField),
        nonce: invoiceNonce!
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
    // Use invoice creation time so R2 (due_date >= current_time) matches chain at verify time
    const issuedAt =
      invoice.createdAt instanceof Date
        ? Math.floor(invoice.createdAt.getTime() / 1000)
        : Math.floor(Date.now() / 1000);
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
    const { invoice, expiresAt, permissions, auditKey: providedAuditKey } = params;

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

    const nonce = (invoice as Invoice & { nonce?: AleoField }).nonce;
    let chainCommitmentRoot: AleoField | undefined;
    let chainFieldCommitments: Record<string, AleoField> | undefined;
    try {
      const [rootSettled, fieldsSettled] = await Promise.allSettled([
        this.registry.getCommitmentRoot(invoice.id),
        this.registry.getFieldCommitments(invoice.id)
      ]);
      if (rootSettled.status === 'fulfilled') {
        chainCommitmentRoot = rootSettled.value ?? undefined;
      } else {
        console.warn('[AuditService.generate] getCommitmentRoot failed', rootSettled.reason);
      }
      if (fieldsSettled.status === 'fulfilled') {
        chainFieldCommitments = fieldsSettled.value ?? undefined;
      } else {
        console.warn('[AuditService.generate] getFieldCommitments failed', fieldsSettled.reason);
      }
    } catch (e) {
      console.warn('[AuditService.generate] Failed to fetch chain commitments', e);
    }

    const useChainAnchored = !nonce && !!chainCommitmentRoot;
    if (!nonce && !chainCommitmentRoot) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'Cannot generate chain-anchored audit package: no commitment_root on chain for this invoice.',
        { hint: 'Invoice must have nonce from create_invoice, or chain must have commitment_root for this invoice_id' }
      );
    }
    if (!useChainAnchored && !invoice.details) {
      throw new AuditServiceError(
        AuditError.MISSING_DETAILS,
        'Invoice details are missing; cannot generate full audit package.',
        { invoiceId: invoice.id }
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
        chainFieldCommitments,
        useChainAnchored
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
   * Five-phase verification for auditors.
   * Phase 1: Package integrity. Phase 2: Invoice on chain. Phase 3: Audit authorization. Phase 4: Chain anchoring. Phase 5: Trustless verification.
   */
  async verifyEnvelopePhases(
    envelope: AuditPackageEnvelope,
    auditKey: string,
    registry?: IInvoiceRegistryService,
    options?: {
      chainRecordFields?: {
        amount: bigint;
        taxAmount: bigint;
        dueDate: number;
        buyer: string;
        seller: string;
        currency: string;
        itemsHash: string;
        memoHash: string;
        orderId: string;
      };
    }
  ): Promise<VerifyEnvelopePhasesResult> {
    const registrySvc = registry ?? this.registry;
    const phase1: VerifyPhaseResult = { ok: false, message: '', checks: [] };
    const phase2: VerifyPhaseResult = { ok: false, message: '', checks: [] };
    const phase3: VerifyPhaseResult = { ok: false, message: '', checks: [] };
    const phase4: VerifyPhaseResult = { ok: false, message: '', checks: [] };
    const phase5: VerifyPhaseResult = { ok: false, message: '', checks: [] };

    let decrypted: DecryptedAuditPayload | undefined;
    const invoiceId = envelope.context.invoice_id;
    const envAuditKeyHash = envelope.context.audit_key_hash;
    const expiresAtSec = envelope.context.expires_at;

    try {
      // --- Phase 1: Pre-check ---
      console.log('[VerifyPhases] Phase 1: pre-check (expiry, decrypt, cipherHash, signature)');
      const nowSec = Math.floor(Date.now() / 1000);
      const expiryOk = nowSec <= expiresAtSec;
      console.log('[VerifyPhases] Phase 1: expiresAt', { expiryOk, nowSec, expiresAtSec, validUntil: new Date(expiresAtSec * 1000).toISOString() });
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
        console.log('[VerifyPhases] Phase 1: decrypt OK');
      } catch {
        console.log('[VerifyPhases] Phase 1 FAIL: decrypt failed');
        phase1.checks!.push({ key: 'decrypt', ok: false, detail: 'Failed to decrypt with provided audit key' });
        phase1.ok = false;
        phase1.message = 'Phase 1 failed: decryption or expiry';
        return { overallValid: false, phase1, phase2, phase3, phase4, phase5 };
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
      console.log('[VerifyPhases] Phase 1: cipherHash', { cipherHashOk });
      phase1.checks!.push({
        key: 'cipherHash',
        ok: cipherHashOk,
        detail: cipherHashOk ? 'Payload integrity verified' : 'Integrity hash mismatch (tampered)'
      });

      const sigOk = !!(decrypted.integrity?.signature);
      console.log('[VerifyPhases] Phase 1: signature', { sigOk });
      phase1.checks!.push({
        key: 'signature',
        ok: sigOk,
        detail: sigOk
          ? 'Signature present (full verification requires issuer public key, e.g. chain seller)'
          : 'Missing signature'
      });

      phase1.ok = expiryOk && cipherHashOk && sigOk;
      phase1.message = phase1.ok ? 'Package integrity verified' : 'Pre-check failed';
      console.log('[VerifyPhases] Phase 1 result:', phase1.ok, { expiryOk, cipherHashOk, sigOk });

      if (!phase1.ok) {
        console.log('[VerifyPhases] Phase 1 FAIL: pre-check failed');
        return { overallValid: false, phase1, phase2, phase3, phase4, phase5, decrypted };
      }

      // --- Phase 2: Invoice on chain (minimal proof: package invoice_hash matches chain) ---
      console.log('[VerifyPhases] Phase 2: fetching invoice_hash for invoiceId:', invoiceId);
      const chainInvoiceHash = await registrySvc.getInvoiceHash(invoiceId);
      const invoiceHashMatch =
        !!chainInvoiceHash &&
        !!decrypted.invoiceHash &&
        this.normalizeField(decrypted.invoiceHash) === this.normalizeField(chainInvoiceHash);
      console.log('[VerifyPhases] Phase 2: invoice on chain', {
        hasChainHash: !!chainInvoiceHash,
        hasPackageHash: !!decrypted.invoiceHash,
        invoiceHashMatch,
        chainHash: chainInvoiceHash ? String(chainInvoiceHash).slice(0, 30) + '...' : null,
        packageHash: decrypted.invoiceHash ? String(decrypted.invoiceHash).slice(0, 30) + '...' : null
      });
      phase2.checks!.push({
        key: 'invoice_registry',
        ok: !!chainInvoiceHash,
        detail: chainInvoiceHash ? `invoice_hash: ${String(chainInvoiceHash).slice(0, 20)}...` : 'Invoice not found on chain'
      });
      phase2.checks!.push({
        key: 'invoice_hash_match',
        ok: invoiceHashMatch,
        detail: invoiceHashMatch
          ? 'Invoice on chain: package invoice_hash matches chain'
          : 'Package invoice_hash does not match chain or invoice not found'
      });
      phase2.ok = invoiceHashMatch;
      phase2.message = phase2.ok ? 'Invoice on chain verified' : 'Phase 2 failed: invoice not on chain or hash mismatch';
      console.log('[VerifyPhases] Phase 2 result:', phase2.ok);

      if (!phase2.ok) {
        console.log('[VerifyPhases] Phase 2 FAIL: invoice not on chain or hash mismatch');
        return { overallValid: false, phase1, phase2, phase3, phase4, phase5, decrypted };
      }

      // disclosed: used in Phase 3 (scopes) and Phase 5 (field_proofs); compute once so Phase 5 runs even when Phase 3 fails
      const disclosed = [...COMMITMENT_FIELD_KEYS].filter((k) => !decrypted!.data.hidden_masks?.includes(k));

      // --- Phase 3: Audit authorization (get_audit_authorization, key hash, scopes) ---
      console.log('[VerifyPhases] Phase 3: fetching get_audit_authorization for invoiceId:', invoiceId);
      const auth = await registrySvc.getAuditAuthorization(invoiceId);
      console.log('[VerifyPhases] Phase 3: get_audit_authorization result:', auth ? { audit_key_hash: auth.audit_key_hash, scopes_bitmask: String(auth.scopes_bitmask) } : null);
      if (!auth) {
        console.log('[VerifyPhases] Phase 3 FAIL: no on-chain audit authorization');
        phase3.checks!.push({ key: 'get_audit_authorization', ok: false, detail: 'No audit authorization on chain' });
        phase3.ok = false;
        phase3.message = 'Phase 3 failed: no on-chain audit authorization';
        // Do not return: continue to Phase 4 and Phase 5
      } else {
        phase3.checks!.push({ key: 'get_audit_authorization', ok: true, detail: 'AuditAuthorization retrieved' });

        const hashMatch = this.normalizeField(auth.audit_key_hash) === this.normalizeField(envAuditKeyHash);
        console.log('[VerifyPhases] Phase 3: audit_key_hash match (envelope vs chain):', hashMatch, { env: envAuditKeyHash, chain: auth.audit_key_hash });
        phase3.checks!.push({
          key: 'audit_key_hash',
          ok: hashMatch,
          detail: hashMatch ? 'Envelope audit_key_hash matches chain' : 'audit_key_hash mismatch'
        });

        const computedKeyHash = (await this.cryptoService.hashObjectToField(auditKey)) as AleoField;
        const bhpOk = this.normalizeField(computedKeyHash) === this.normalizeField(auth.audit_key_hash);
        console.log('[VerifyPhases] Phase 3: BHP256(AuditKey) match:', bhpOk, { computed: computedKeyHash, chain: auth.audit_key_hash });
        phase3.checks!.push({
          key: 'BHP256(AuditKey)',
          ok: bhpOk,
          detail: bhpOk ? 'BHP256(AuditKey) == chain audit_key_hash' : 'Audit key hash mismatch'
        });

        const FIELD_SCOPE_IDS: Record<string, number> = {
          amount: 1, tax_amount: 2, due_date: 3, buyer: 4, seller: 5, currency: 6, items_hash: 7, memo_hash: 8, order_id: 9
        };
        let scopesOk = true;
        for (const f of disclosed) {
          const scopeId = FIELD_SCOPE_IDS[f];
          if (scopeId && !(auth.scopes_bitmask & (1n << BigInt(scopeId - 1)))) {
            scopesOk = false;
            console.log('[VerifyPhases] Phase 3: scopes_bitmask FAIL at field:', f, 'scopeId:', scopeId, 'scopes_bitmask:', String(auth.scopes_bitmask));
            break;
          }
        }
        if (scopesOk) console.log('[VerifyPhases] Phase 3: scopes_bitmask OK, disclosed:', disclosed);
        phase3.checks!.push({
          key: 'scopes_bitmask',
          ok: scopesOk,
          detail: scopesOk ? 'Disclosed fields within scopes_bitmask' : 'Disclosed fields exceed authorization'
        });

        phase3.ok = hashMatch && bhpOk && scopesOk;
        phase3.message = phase3.ok ? 'Audit authorization passed' : 'Phase 3 failed';
        console.log('[VerifyPhases] Phase 3 result:', phase3.ok, { hashMatch, bhpOk, scopesOk });
      }
      // Phase 3 failure does not block Phase 4/5: continue

      // --- Phase 4: Chain anchoring ---
      console.log('[VerifyPhases] Phase 4: fetching chain anchors (invoice_hash, commitment_root, rules_result, field_commitments)');
      const [invoiceHash, commitmentRoot, rulesResult, fieldCommitments] = await Promise.all([
        registrySvc.getInvoiceHash(invoiceId),
        registrySvc.getCommitmentRoot(invoiceId),
        registrySvc.getRulesResult(invoiceId),
        registrySvc.getFieldCommitments(invoiceId)
      ]);
      console.log('[VerifyPhases] Phase 4: anchors', {
        hasInvoiceHash: !!invoiceHash,
        hasCommitmentRoot: !!commitmentRoot,
        hasRulesResult: !!rulesResult,
        hasFieldCommitments: !!fieldCommitments,
        commitmentRoot: commitmentRoot ? String(commitmentRoot).slice(0, 30) + '...' : null
      });
      phase4.checks!.push({
        key: 'invoice_registry',
        ok: !!invoiceHash,
        detail: invoiceHash ? `invoice_hash: ${String(invoiceHash).slice(0, 20)}...` : 'Invoice not found'
      });
      phase4.checks!.push({
        key: 'invoice_commitment',
        ok: !!commitmentRoot,
        detail: commitmentRoot ? `commitment_root: ${String(commitmentRoot).slice(0, 20)}...` : 'No commitment root'
      });
      phase4.checks!.push({
        key: 'invoice_rules_result',
        ok: !!rulesResult,
        detail: rulesResult ? 'rules_result available' : 'No rules result'
      });
      phase4.checks!.push({
        key: 'field_commitments',
        ok: !!fieldCommitments,
        detail: fieldCommitments ? 'Field commitments cached on chain' : 'No field commitments cache'
      });
      phase4.ok = !!invoiceHash && !!commitmentRoot;
      phase4.message = phase4.ok ? 'Chain anchors retrieved' : 'Phase 4 failed';
      if (!phase4.ok) console.log('[VerifyPhases] Phase 4 FAIL: missing', !invoiceHash ? 'invoice_hash' : '', !commitmentRoot ? 'commitment_root' : '');

      if (!phase4.ok) {
        return { overallValid: false, phase1, phase2, phase3, phase4, phase5, decrypted };
      }

      // --- Phase 5: Trustless verification ---
      const pkgRoot = this.normalizeField(decrypted.commitments.root);
      const chainRoot = this.normalizeField(commitmentRoot!);
      const rootOk = pkgRoot === chainRoot;
      console.log('[VerifyPhases] Phase 5: commitment_root', { rootOk, pkgRoot: pkgRoot.slice(0, 30) + '...', chainRoot: chainRoot.slice(0, 30) + '...' });
      phase5.checks!.push({
        key: 'commitment_root',
        ok: rootOk,
        detail: rootOk ? 'Package root matches chain' : 'Commitment root mismatch'
      });

      const { commitField } = await import('./commitmentUtils');
      const nonce = decrypted.nonce;
      const isChainAnchoredOnly =
        this.normalizeField(nonce) === this.normalizeField(AuditService.CHAIN_ANCHORED_NONCE);
      const salt = nonce;
      const chainRecordFields = options?.chainRecordFields;
      let fieldProofOk = true;
      if (isChainAnchoredOnly) {
        // No nonce to recompute; only compare package to chain root and (if available) field_commitments.
        if (fieldCommitments) {
          for (const key of disclosed) {
            const expectedCommit = decrypted.commitments[key as keyof typeof decrypted.commitments];
            const chainCommit = fieldCommitments[key];
            if (expectedCommit == null || chainCommit == null) continue;
            if (this.normalizeField(expectedCommit) !== this.normalizeField(chainCommit)) {
              fieldProofOk = false;
              break;
            }
          }
        }
        // else: no chain field_commitments; root already compared above, fieldProofOk stays true
      } else if (fieldCommitments) {
        for (const key of disclosed) {
          const expectedCommit = decrypted.commitments[key as keyof typeof decrypted.commitments];
          const chainCommit = fieldCommitments[key];
          if (expectedCommit == null || chainCommit == null) continue;
          if (this.normalizeField(expectedCommit) !== this.normalizeField(chainCommit)) {
            fieldProofOk = false;
            break;
          }
        }
      } else if (chainRecordFields) {
        const fieldsSnake: Record<string, string | number | bigint> = {
          amount: chainRecordFields.amount,
          tax_amount: chainRecordFields.taxAmount,
          due_date: chainRecordFields.dueDate,
          buyer: chainRecordFields.buyer,
          seller: chainRecordFields.seller,
          currency: chainRecordFields.currency,
          items_hash: chainRecordFields.itemsHash,
          memo_hash: chainRecordFields.memoHash,
          order_id: chainRecordFields.orderId
        };
        for (const key of disclosed) {
          const tagVal = (FIELD_TAGS as Record<string, bigint>)[key] ?? 0n;
          const tag = `${tagVal}field` as AleoField;
          const expectedCommit = decrypted.commitments[key as keyof typeof decrypted.commitments];
          if (expectedCommit == null) continue;
          const raw = fieldsSnake[key];
          const val: AleoField | string =
            typeof raw === 'number' || typeof raw === 'bigint'
              ? `${String(raw)}field` as AleoField
              : (raw as string);
          try {
            const computed = commitField(val, salt, tag);
            if (this.normalizeField(computed) !== this.normalizeField(expectedCommit)) fieldProofOk = false;
          } catch {
            fieldProofOk = false;
          }
        }
      } else {
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
      }
      console.log('[VerifyPhases] Phase 5: field_proofs', {
        fieldProofOk,
        isChainAnchoredOnly,
        hasFieldCommitments: !!fieldCommitments,
        hasChainRecordFields: !!chainRecordFields,
        disclosed
      });
      phase5.checks!.push({
        key: 'field_proofs',
        ok: fieldProofOk,
        detail: fieldProofOk
          ? isChainAnchoredOnly
            ? 'Chain-anchored package: verified against chain root (and field_commitments)'
            : 'Field commitments match plaintext'
          : 'Field proof mismatch'
      });

      const data = decrypted.data;
      let rulesOk = true;
      let rulesResultMatch: boolean | null = null; // null = not compared (no chain anchor)

      // Safely coerce payload numbers to BigInt (audit payload may contain decimals e.g. 71.04)
      const toBigIntSafe = (v: unknown): bigint => {
        if (v == null || v === '') return 0n;
        const n = Number(v);
        if (!Number.isFinite(n)) return 0n;
        return BigInt(Math.round(n));
      };

      if (data.amount != null && data.tax_amount != null) {
        const amount = toBigIntSafe(data.amount);
        const taxAmount = toBigIntSafe(data.tax_amount);
        const expectedTotal = amount + taxAmount;
        const lineItemsSum = toBigIntSafe(data.line_items_sum ?? data.amount ?? 0);
        const taxRateBps = toBigIntSafe(data.tax_rate_bps ?? 0);
        // Use creation time (issuedAt) for R2 so it matches chain: due_date >= current_time at create_invoice
        const currentTimeForRules = Number(decrypted.issuedAt ?? 0) || Math.floor(Date.now() / 1000);
        const evalResult = await this.cryptoService.evaluateAuditRules({
          amount,
          taxAmount,
          dueDate: Number(data.due_date ?? 0),
          currentTime: currentTimeForRules,
          lineItemsSum,
          expectedTotal,
          taxRateBps,
          invoiceHash: (decrypted.invoiceHash ?? '') as AleoField
        });
        rulesOk = evalResult.r1 && evalResult.r2 && evalResult.r3 && evalResult.r4 && evalResult.r5;

        if (rulesResult) {
          const { computeRulesResultField } = await import('./commitmentUtils');
          const recomputedRulesField = computeRulesResultField(
            evalResult.r1,
            evalResult.r2,
            evalResult.r3,
            evalResult.r4,
            evalResult.r5
          );
          rulesResultMatch =
            this.normalizeField(recomputedRulesField) === this.normalizeField(rulesResult);
          console.log('[VerifyPhases] Phase 5: rules_result_match', {
            rulesResultMatch,
            recomputed: this.normalizeField(recomputedRulesField),
            chain: this.normalizeField(rulesResult),
            R1R5: { r1: evalResult.r1, r2: evalResult.r2, r3: evalResult.r3, r4: evalResult.r4, r5: evalResult.r5 }
          });
          phase5.checks!.push({
            key: 'rules_result_match',
            ok: rulesResultMatch,
            detail: rulesResultMatch
              ? 'Data compliance: recomputed rules_result matches chain'
              : 'Data compliance failed: rules_result mismatch'
          });
        } else {
          phase5.checks!.push({
            key: 'rules_result_match',
            ok: true,
            detail: 'Rules R1–R5 evaluated (no chain rules_result to compare)'
          });
        }
      }

      console.log('[VerifyPhases] Phase 5: financial_logic (R1–R5)', { rulesOk });
      phase5.checks!.push({
        key: 'financial_logic',
        ok: rulesOk,
        detail: rulesOk ? 'R1–R5 passed' : 'Financial logic check failed'
      });

      const rulesResultOk = rulesResultMatch === null || rulesResultMatch === true;
      phase5.ok = rootOk && fieldProofOk && rulesOk && rulesResultOk;
      phase5.message = phase5.ok ? 'Trustless verification passed' : 'Phase 5 failed';
      console.log('[VerifyPhases] Phase 5 result:', {
        phase5Ok: phase5.ok,
        rootOk,
        fieldProofOk,
        rulesOk,
        rulesResultMatch,
        rulesResultOk
      });

      const overallValid = phase1.ok && phase2.ok && phase3.ok && phase4.ok && phase5.ok;
      return { overallValid, phase1, phase2, phase3, phase4, phase5, decrypted };
    } catch (e: any) {
      console.error('[VerifyPhases] Verification error:', e?.message ?? e);
      phase1.ok = false;
      phase1.message = 'Verification error';
      phase1.checks!.push({ key: 'error', ok: false, detail: e?.message ?? 'Unknown error' });
      return { overallValid: false, phase1, phase2, phase3, phase4, phase5, decrypted };
    }
  }

  private normalizeField(f: AleoField | string): string {
    return String(f).replace(/field\.(private|public)$/i, 'field').trim();
  }
}
