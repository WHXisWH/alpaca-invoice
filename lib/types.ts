export type AleoAddress = `aleo1${string}`;
export type AleoField = `${string}field`;
export type AleoTransactionId = `at1${string}`;
export type Microcredits = bigint;

export enum InvoiceStatus {
  PENDING = 0,
  PAID = 1,
  CANCELLED = 2,
  EXPIRED = 3
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceDetails {
  invoiceNumber: string;
  orderId?: string;           // Optional; when omitted, use invoiceNumber for order_id derivation
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  notes?: string;
}

export interface Invoice {
  id: AleoField;
  seller: AleoAddress;
  buyer: AleoAddress;
  amount: Microcredits;
  taxAmount?: Microcredits;
  invoiceHash: AleoField;
  dueDate: Date;
  createdAt: Date;
  status: InvoiceStatus;
  orderId?: AleoField;
  currency?: AleoField;
  itemsHash?: AleoField;
  memoHash?: AleoField;
  details?: InvoiceDetails;
  metadata?: {
    confirmationStatus: 'SENDING' | 'CONFIRMED';
    lastUpdated: Date;
    dataSource: 'local' | 'chain';
    action?: 'create' | 'cancel' | 'pay';
  };
}

export interface EncryptedPayload {
  iv: string;         // Initialization vector (Base64)
  ciphertext: string; // Ciphertext (Base64)
  authTag?: string;   // AES-GCM authentication tag (Base64) - Wave 2 required for tamper detection
}

/**
 * All computed values for create_invoice, including hash inputs and validation guards.
 * Replaces InvoiceHashContext. Use for both computeInvoiceHash context and chain submission.
 */
export interface InvoiceChainComputed {
  seller: AleoAddress;
  buyer: AleoAddress;
  dueDate: number;
  nonce: AleoField;
  orderIdField: AleoField;
  currencyField: AleoField;
  itemsHash: AleoField;
  memoHash: AleoField;
  invoiceHash: AleoField;
  lineItemsSum: bigint;
  expectedTotal: bigint;
  taxRateBps: bigint;
}

/**
 * Hash input for computeInvoiceHash / verifyInvoiceIntegrity.
 * When amount and taxAmount are provided, matches contract compute_invoice_hash_internal(seller, buyer, amount, tax_amount, due_date, nonce, order_id, currency, items_hash, memo_hash).
 */
export type InvoiceHashInput = Omit<
  InvoiceChainComputed,
  'invoiceHash' | 'lineItemsSum' | 'expectedTotal' | 'taxRateBps'
> & { amount?: bigint; taxAmount?: bigint };

/**
 * Contract-aligned 10 parameters for invoice hash. Mirrors main.leo InvoiceHashInput / compute_invoice_hash_internal.
 * Use for pure hash computation (no dependency on InvoiceDetails). Extensible when the program adds fields.
 */
export interface ContractInvoiceHashParams {
  seller: AleoAddress;
  buyer: AleoAddress;
  amount: bigint;
  taxAmount: bigint;
  dueDate: number;
  nonce: AleoField;
  orderId: AleoField;
  currency: AleoField;
  itemsHash: AleoField;
  memoHash: AleoField;
}

/** Chain context: the 8 fields that come from chain/creation; amount/tax come from details when building params. */
export type InvoiceHashChainContext = Omit<InvoiceHashInput, 'amount' | 'taxAmount'>;

export interface CreateInvoiceParams {
  buyer: AleoAddress;
  amount: Microcredits;
  dueDate: Date;
  details: InvoiceDetails;
}

export interface CreateInvoiceResult {
  transactionId: AleoTransactionId;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  encryptedDetails: EncryptedPayload;
}

export interface PayInvoiceParams {
  invoiceId: AleoField;
  paymentRecord: string;
}

export interface PaymentResult {
  transactionId: AleoTransactionId;
  paymentId: AleoField;
  changeRecord?: string;
}

export interface PaymentReceipt {
  paymentId: AleoField;
  invoiceId: AleoField;
  payer: AleoAddress;
  payee: AleoAddress;
  amount: Microcredits;
  paidAt: Date;
}

export interface AuditKeyConfig {
  invoiceIds: AleoField[];
  permissions: string[];
  expiresAt: number;
}

export interface AuditKey {
  key: string;
  config: AuditKeyConfig;
  signature: string;
  issuedAt: number;
}

export interface AuditPackageV1 {
  version: 1;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  expiresAt: number;
  issuedAt: number;
  signerAddress: AleoAddress;
  cipher: EncryptedPayload;
  cipherHash: string;
  signature: string;
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

export interface ChainVerificationResult {
  invoiceExistsOnChain: boolean;
  hashMatchesChain: boolean;
  chainStatus: InvoiceStatus | null;
}
