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
   * @returns invoiceHash used to navigate to the invoice detail page
   */
  executeCreateInvoice(params: CreateInvoiceParams): Promise<AleoField>;

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
}
