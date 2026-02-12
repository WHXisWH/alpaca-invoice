import {
  AleoAddress, AleoField, AleoTransactionId, InvoiceStatus, Microcredits
} from '@/lib/types';
import { createServiceError } from '@/lib/service-errors';

/**
 * Protocol service error codes
 * Handles various risks in network and node communication
 */
export enum ProtocolError {
  NODE_CONNECTION_FAILED = 'NODE_CONNECTION_FAILED', // Unable to connect to Aleo node (RPC failure)
  INVALID_RECORD = 'INVALID_RECORD',           // Record format parsing error
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED', // Node rejected the transaction (e.g., insufficient fee or logic conflict)
  SYNC_TIMEOUT = 'SYNC_TIMEOUT',               // Block sync timeout
  MAPPING_NOT_FOUND = 'MAPPING_NOT_FOUND'      // Specified Mapping not found on-chain (e.g., program not deployed)
}

/**
 * Protocol service error class
 */
export const ProtocolServiceError = createServiceError<ProtocolError>('AleoProtocol');
export type ProtocolServiceError = InstanceType<typeof ProtocolServiceError>;

export interface IAleoProtocolService {
  /**
   * Get the latest block height of the current chain
   * Used by the Controller to determine the scan endpoint
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  getLatestBlockHeight(): Promise<number>;

  /**
   * Get public balance (queried from on-chain Mapping)
   * Queries the account mapping of the credits.aleo program
   * @param address Aleo address
   * @returns Public balance (Microcredits)
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  getPublicBalance(address: AleoAddress): Promise<Microcredits>;

  /**
   * Get all encrypted Records for a specified address under a specific program
   * @param programId Program identifier (e.g., "zk_invoice_v2.aleo")
   * @param address User address
   * @param startHeight Starting scan height
   * @returns Array of raw ciphertext strings
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  fetchRawRecords(
    programId: string,
    address: AleoAddress,
    startHeight: number
  ): Promise<string[]>;

  /**
   * Query on-chain program Mapping values (generic method)
   * Can query any Mapping of any program
   * @param programId Program identifier (e.g., "zk_invoice_v2.aleo")
   * @param mappingName Mapping name (e.g., "invoice_status")
   * @param key Mapping key (Field type)
   * @returns Mapping value (string format), or null if it does not exist
   * @throws {ProtocolServiceError} May throw MAPPING_NOT_FOUND, NODE_CONNECTION_FAILED
   */
  getProgramMappingValue(
    programId: string,
    mappingName: string,
    key: AleoField
  ): Promise<string | null>;

  /**
   * Compute invoice_id locally by running compute_invoice_id (no fee).
   */
  computeInvoiceIdOffline(params: {
    seller: AleoAddress;
    buyer: AleoAddress;
    amount: Microcredits;
    dueDate: number;
    nonce: AleoField;
  }): Promise<AleoField>;

  /**
   * Convenience: fetch on-chain invoice hash anchor from invoice_registry.
   */
  getInvoiceHash(invoiceId: AleoField): Promise<AleoField | null>;

  /**
   * Convenience: fetch on-chain invoice status (u8) from invoice_status.
   */
  getInvoiceStatus(invoiceId: AleoField): Promise<InvoiceStatus | null>;

  /**
   * Convenience: fetch seller invoice count from invoice_count.
   */
  getInvoiceCount(seller: AleoAddress): Promise<number>;

  /**
   * Verify invoice hash matches on-chain anchor and return status.
   */
  verifyInvoiceOnChain(
    invoiceId: AleoField,
    localHash: AleoField
  ): Promise<{
    exists: boolean;
    hashMatch: boolean;
    chainStatus: InvoiceStatus | null;
  }>;

  /**
   * Broadcast a generated zero-knowledge proof transaction to the Aleo network
   * @param transactionPayload Proof data payload
   * @returns The generated transaction ID
   * @throws {ProtocolServiceError} May throw TRANSACTION_REJECTED, NODE_CONNECTION_FAILED
   */
  broadcastTransaction(transactionPayload: any): Promise<AleoTransactionId>;

  /**
   * Wait for transaction confirmation
   * @param txId Transaction ID
   * @param timeoutMS Timeout in milliseconds
   * @returns Confirmation receipt information
   * @throws {ProtocolServiceError} May throw SYNC_TIMEOUT, NODE_CONNECTION_FAILED
   */
  waitForTransaction(txId: AleoTransactionId, timeoutMS?: number): Promise<any>;

  /**
   * Estimate execution fee (Microcredits)
   * Estimates by building an Authorization and using the SDK's estimateFeeForAuthorization
   * @param programName Program name (e.g., "zk_invoice_v2.aleo")
   * @param functionName Function name (e.g., "create_invoice")
   * @param inputs Array of function input parameters
   * @returns Estimated execution fee (Microcredits), with 20% buffer added
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  estimateExecutionFee(
    programName: string,
    functionName: string,
    inputs: string[]
  ): Promise<Microcredits>;

  /**
   * Verify whether a generated record has been successfully committed on-chain
   * Verifies transaction confirmation by querying transaction details, and optionally verifies that the transaction contains the expected records
   * @param transactionId Transaction ID
   * @param options Optional verification options
   * @param options.programId Program ID (e.g., "zk_invoice_v2.aleo"), used to verify the transaction belongs to this program
   * @param options.functionName Function name (e.g., "create_invoice"), used to verify the function called by the transaction
   * @param options.expectedOutputsCount Expected number of output records, used to verify the transaction produced the expected records
   * @returns Verification result object, including success status, transaction details, etc.
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED, TRANSACTION_REJECTED
   */
  verifyRecordOnChain(
    transactionId: AleoTransactionId,
    options?: {
      programId?: string;
      functionName?: string;
      expectedOutputsCount?: number;
    }
  ): Promise<{
    verified: boolean;
    transaction: any;
    message: string;
  }>;
}
