import { CreateInvoiceParams, AleoTransactionId, AleoField, Invoice } from '@/lib/types'

export interface ITxController {
  // --- State exposure ---
  isProcessing: boolean;    // Whether proof generation or broadcast is in progress
  currentProgress: number;  // 0-100
  currentLog: string;       // Real-time log (e.g. "Synthesis in progress...")

  // --- Business methods ---
  /** * Logic:
   * 1. Call CryptoService.computeInvoiceHash to compute the invoice hash
   * 2. Call WalletService.requestTransaction to request a transaction (wallet internally generates ZKP proof)
   * 3. Locally encrypt and archive to IndexedDB
   * @returns { invoiceHash, invoiceId } used to navigate and for executeSetAuditAuthorization
   */
  executeCreateInvoice(params: CreateInvoiceParams): Promise<{ invoiceHash: AleoField; invoiceId: AleoField }>;

  /** * Logic:
   * 1. Get required data from the Invoice object
   * 2. Call WalletService.requestTransaction to request a payment transaction (wallet internally generates ZKP proof)
   * 3. Return transaction ID
   */
  executePay(invoice: Invoice): Promise<AleoTransactionId>;

  /** * Execute invoice cancellation
   * Logic:
   * 1. Get required data from the Invoice object
   * 2. Call cancel_invoice transition
   * 3. Update local state
   */
  executeCancel(invoice: Invoice): Promise<AleoTransactionId>;

  /**
   * Set audit authorization for an invoice (seller only).
   * @param invoice Invoice metadata (used to locate the on-chain record)
   * @param auditKeyHash field hash of the audit key
   * @param scopesBitmask bitmask of allowed fields (u64)
   * @param expiresAt Unix seconds expiry
   */
  executeSetAuditAuthorization(
    invoice: Invoice,
    auditKeyHash: string,
    scopesBitmask: bigint,
    expiresAt: number
  ): Promise<AleoTransactionId>;
}
