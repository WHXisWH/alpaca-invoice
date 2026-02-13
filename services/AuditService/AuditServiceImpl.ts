import type { AleoAddress, Invoice, AuditKey } from '@/lib/types';
import {
  AuditPackage,
  filterDetailsByPermissions,
  buildAuditMessage,
  validateAuditPackage
} from '@/lib/audit';
import { PROGRAM_ID } from '@/lib/contract';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import type { IAleoProtocolService } from '@/services/AleoProtocolService/IAleoProtocolService';
import {
  IAuditService,
  AuditServiceError,
  AuditError,
  GenerateAuditPackageParams,
  GenerateAuditPackageResult,
  ValidateAuditPackageResult
} from './IAuditService';

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
    auditorAddress: AleoAddress;
    expiresAt: number;
    auditKey: string;
  }): Promise<{ pkg: AuditPackage; key: AuditKey }> {
    const { invoice, permissions, auditorAddress, expiresAt, auditKey } = params;

    try {
      // 1. Filter invoice data by permissions
      const filtered = filterDetailsByPermissions(invoice, permissions);
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
      const message = buildAuditMessage({
        invoiceId: invoice.id,
        invoiceHash: invoice.invoiceHash,
        auditorAddress,
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
        auditorAddress,
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
          expiresAt,
          auditorAddress
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
    const { invoiceId, auditorAddress, expiresAt, permissions } = params;

    // Validate input parameters
    if (!invoiceId || !invoiceId.trim()) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'Invoice ID is required',
        { hint: 'Please enter a valid invoice ID' }
      );
    }

    if (!auditorAddress || !auditorAddress.trim()) {
      throw new AuditServiceError(
        AuditError.INVALID_INPUT,
        'Auditor address is required',
        { hint: 'Please enter a valid Aleo address' }
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
        auditorAddress,
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
      const result = await validateAuditPackage({
        pkg,
        auditKey,
        computeInvoiceHash: (details) => this.cryptoService.computeInvoiceHash(details),
        protocolService: this.protocolService
      });

      return {
        valid: result.valid,
        reason: result.reason,
        decrypted: result.decrypted,
        chainVerification: result.chainVerification
      };
    } catch (error: any) {
      throw new AuditServiceError(
        AuditError.VALIDATION_FAILED,
        'Failed to validate audit package',
        { originalError: error.message || error }
      );
    }
  }
}
