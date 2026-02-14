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
  invoiceHash: AleoField;
  dueDate: Date;
  createdAt: Date;
  status: InvoiceStatus;
  details?: InvoiceDetails;
  metadata?: {  // ✅ 新增：可选的 metadata（与 InvoiceStorageData 保持一致）
    confirmationStatus: 'SENDING' | 'CONFIRMED';
    lastUpdated: Date;
    dataSource: 'local' | 'chain';
    action?: 'create' | 'cancel' | 'pay'; // ✅ 标识当前操作类型
  };
}

export interface EncryptedPayload {
  iv: string;         // Initialization vector (Base64)
  ciphertext: string; // Ciphertext (Base64)
  authTag?: string;   // AES-GCM authentication tag (Base64) - Wave 2 required for tamper detection
}

/**
 * Wave 2 contract context for invoice hash computation.
 * Matches InvoiceHashInput in main.leo: seller, buyer, amount, tax_amount, due_date,
 * nonce, order_id, currency, items_hash, memo_hash
 */
export interface InvoiceHashContext {
  seller: AleoAddress;
  buyer: AleoAddress;
  orderId: AleoField;
  nonce: AleoField;
  itemsHash: AleoField;
  memoHash: AleoField;
  currency: AleoField;
  dueDate: number;
}

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
