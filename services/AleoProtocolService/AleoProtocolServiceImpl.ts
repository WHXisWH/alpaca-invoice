import {
  AleoAddress,
  AleoField,
  AleoTransactionId,
  Microcredits
} from '@/lib/types';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { IAleoProtocolService, ProtocolServiceError, ProtocolError } from './IAleoProtocolService';
import { AleoNetworkClient, ProgramManager } from '@provablehq/sdk';

/**
 * AleoProtocolService implementation class
 *
 * Responsibilities: Interacts with Aleo blockchain nodes to query on-chain data and broadcast transactions
 *
 * Uses @provablehq/sdk's AleoNetworkClient to automatically handle URL construction and version compatibility
 */
export class AleoProtocolService implements IAleoProtocolService {
  private networkClient: AleoNetworkClient;
  private programManager: ProgramManager | null = null;
  private network: WalletAdapterNetwork;

  constructor(network: WalletAdapterNetwork = WalletAdapterNetwork.TestnetBeta) {
    const baseUrl = this.getBaseUrlForNetwork(network);
    this.networkClient = new AleoNetworkClient(baseUrl);
    this.network = network;
  }

  /**
   * Get or create ProgramManager instance (lazy initialization)
   * ProgramManager may require WASM initialization, so lazy loading strategy is used
   */
  private getProgramManager(): ProgramManager {
    if (!this.programManager) {
      const baseUrl = this.getBaseUrlForNetwork(this.network);
      // ProgramManager constructor: (host?, keyProvider?, recordProvider?, networkClientOptions?)
      // For fee estimation, we don't need keyProvider and recordProvider
      this.programManager = new ProgramManager(baseUrl);
    }
    return this.programManager;
  }

  /**
   * Get base RPC URL based on network type (for AleoNetworkClient)
   */
  private getBaseUrlForNetwork(network: WalletAdapterNetwork): string {
    switch (network) {
      case WalletAdapterNetwork.MainnetBeta:
        return 'https://api.explorer.provable.com/v1';
      case WalletAdapterNetwork.Testnet:
      case WalletAdapterNetwork.TestnetBeta:
        return 'https://api.explorer.provable.com/v1';
      default:
        return 'https://api.explorer.provable.com/v1';
    }
  }

  /**
   * Get the latest block height of the current chain
   *
   * Uses AleoNetworkClient.getLatestHeight() to directly retrieve the latest block height
   */
  async getLatestBlockHeight(): Promise<number> {
    try {
      const height = await this.networkClient.getLatestHeight();

      if (!height || height < 0) {
        throw new ProtocolServiceError(
          ProtocolError.NODE_CONNECTION_FAILED,
          'Failed to fetch latest block height: invalid response',
          { height }
        );
      }

      return height;
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to connect to Aleo node',
        { originalError: error }
      );
    }
  }

  /**
   * Get public balance (queried from on-chain Mapping)
   * Queries the account mapping of the credits.aleo program
   *
   * Uses AleoNetworkClient.getProgramMappingValue; returns 0 if the result is null
   */
  async getPublicBalance(address: AleoAddress): Promise<Microcredits> {
    try {
      const balance = await this.networkClient.getProgramMappingValue(
        'credits.aleo',
        'account',
        address
      );

      // If null is returned, balance is 0
      if (balance === null || balance === undefined) {
        return 0n;
      }

      // Process the returned balance value (may be a string or number)
      const balanceStr = String(balance).trim();

      // Remove possible unit suffix (e.g., "u64") and parse as bigint
      const cleanBalanceStr = balanceStr
        .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
        .replace(/u64$/i, '') // Remove u64 suffix (case-insensitive)
        .trim();

      return BigInt(cleanBalanceStr || 0);
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // Network error or other errors, return 0 (the address may not have a public balance)
      console.warn('Failed to get public balance, returning 0:', error);
      return 0n;
    }
  }

  /**
   * Get all encrypted Records for a specified address under a specific program
   *
   * Note: This method requires a private key to decrypt Records.
   * AleoNetworkClient.findUnspentRecords requires a PrivateKey parameter.
   *
   * It is recommended to handle Record queries in the upper-layer Service (e.g., WalletService),
   * since only the Wallet layer holds the user's private key.
   *
   * For implementation reference:
   * const records = await this.networkClient.findUnspentRecords(
   *   startHeight,
   *   undefined,
   *   privateKey,
   *   undefined,
   *   undefined
   * );
   */
  async fetchRawRecords(
    programId: string,
    address: AleoAddress,
    startHeight: number
  ): Promise<string[]> {
    throw new ProtocolServiceError(
      ProtocolError.INVALID_RECORD,
      'Record fetching requires private key and should be handled by WalletService',
      { programId, address, startHeight }
    );
  }

  /**
   * Query on-chain program Mapping value (generic method)
   *
   * Can query any Mapping of any program, for example:
   * - credits.aleo account mapping (balance query)
   * - zk_invoice.aleo invoice_status mapping (invoice status query)
   * - Any custom program's Mapping
   *
   * @param programId Program identifier (e.g., "zk_invoice.aleo")
   * @param mappingName Mapping name (e.g., "invoice_status")
   * @param key Mapping key (Field type)
   * @returns Mapping value (string format), or null if it does not exist
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  async getProgramMappingValue(
    programId: string,
    mappingName: string,
    key: AleoField
  ): Promise<string | null> {
    try {
      const value = await this.networkClient.getProgramMappingValue(
        programId,
        mappingName,
        key
      );

      // If null or undefined is returned, the key does not exist in the Mapping
      if (value === null || value === undefined) {
        return null;
      }

      // Return the value in string format (may include type suffixes such as "123u64", "0u8", etc.)
      return String(value);
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // Network error or other errors
      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to query program mapping value',
        { programId, mappingName, key, originalError: error }
      );
    }
  }

  /**
   * Broadcast a generated zero-knowledge proof transaction to the Aleo network
   *
   * Uses AleoNetworkClient.submitTransaction to submit the transaction
   */
  async broadcastTransaction(transactionPayload: any): Promise<AleoTransactionId> {
    try {
      const txId = await this.networkClient.submitTransaction(transactionPayload);

      if (!txId || !txId.startsWith('at1')) {
        throw new ProtocolServiceError(
          ProtocolError.TRANSACTION_REJECTED,
          'Invalid transaction ID returned',
          { txId }
        );
      }

      return txId as AleoTransactionId;
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      throw new ProtocolServiceError(
        ProtocolError.TRANSACTION_REJECTED,
        'Failed to broadcast transaction',
        { originalError: error }
      );
    }
  }

  /**
   * Wait for transaction confirmation
   *
   * Polls getTransaction to check the transaction status
   */
  async waitForTransaction(txId: AleoTransactionId, timeoutMS: number = 60000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds

    while (Date.now() - startTime < timeoutMS) {
      try {
        const transaction = await this.networkClient.getTransaction(txId);

        if (transaction) {
          // Transaction confirmed
          return transaction;
        }
      } catch (error) {
        // Transaction may not have been received by the node yet, continue polling
        console.debug('Transaction not found yet, continuing to poll:', txId);
      }

      // Wait for the next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout
    throw new ProtocolServiceError(
      ProtocolError.SYNC_TIMEOUT,
      'Transaction confirmation timeout',
      { txId, timeoutMS }
    );
  }

  /**
   * Estimate execution fee (Microcredits)
   *
   * Builds an Authorization and uses the SDK's estimateFeeForAuthorization for estimation
   * Adds 20% buffer to ensure the transaction can be successfully executed
   *
   * If SDK estimation fails, returns a fallback value: 250,000 microcredits (0.25 credits)
   */
  async estimateExecutionFee(
    programName: string,
    functionName: string,
    inputs: string[]
  ): Promise<Microcredits> {
    try {
      const programManager = this.getProgramManager();

      // Step 1: Build Authorization object
      // This object contains the complete transaction description but hasn't generated the expensive ZK proof yet
      const authorization = await programManager.buildAuthorization({
        programName,
        functionName,
        inputs,
        // If the program hasn't been deployed or is local, you can pass in programSource
        // But usually it's not needed since the SDK will fetch from the network
      });

      // Step 2: Use estimateFeeForAuthorization for estimation
      const baseFeeMicrocredits = await programManager.estimateFeeForAuthorization({
        authorization,
        programName: 'credits.aleo', // Fee payment program
      });

      // Step 3: Convert and add 20% buffer
      const fee = BigInt(baseFeeMicrocredits);
      const feeWithBuffer = (fee * 120n) / 100n; // Add 20% buffer

      return feeWithBuffer;
    } catch (error: any) {
      console.error('SDK fee estimation failed:', error);

      // If it's a ProtocolServiceError, rethrow directly
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // Fallback: return a hardcoded empirical value
      // 250,000 microcredits = 0.25 credits
      // This is a conservative estimate suitable for most simple contract calls
      console.warn('Using fallback fee estimate: 250,000 microcredits');
      return 250_000n;
    }
  }

  /**
   * Verify whether a generated record has been successfully committed on-chain
   *
   * Verifies transaction confirmation by querying transaction details, and optionally
   * validates whether the transaction contains the expected records
   *
   * Verification logic:
   * 1. Check if the transaction exists and is confirmed
   * 2. If programId is provided, verify the transaction belongs to that program
   * 3. If functionName is provided, verify the function name called by the transaction
   * 4. If expectedOutputsCount is provided, verify the number of output records produced by the transaction
   */
  async verifyRecordOnChain(
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
  }> {
    try {
      // Step 1: Query transaction details
      const transaction = await this.networkClient.getTransaction(transactionId);

      if (!transaction) {
        return {
          verified: false,
          transaction: null,
          message: `Transaction ${transactionId} not found on chain`
        };
      }

      // Step 2: Verify the transaction is confirmed (existence implies confirmation)
      // If a transaction is rejected or fails, it typically won't appear on chain, so existence is assumed to mean success

      // Cast the transaction object to any for safe access to dynamic properties
      const tx = transaction as any;

      // Step 3: If programId is provided, verify the transaction belongs to that program
      if (options?.programId) {
        // Check if the transaction's transitions contain the specified program
        const transitions = tx.transitions || tx.execution?.transitions || [];
        const hasMatchingProgram = transitions.some((transition: any) => {
          const program = transition.program || transition.id?.program || '';
          return program === options.programId || program.includes(options.programId);
        });

        if (!hasMatchingProgram) {
          return {
            verified: false,
            transaction,
            message: `Transaction does not belong to program ${options.programId}`
          };
        }
      }

      // Step 4: If functionName is provided, verify the function name called by the transaction
      if (options?.functionName) {
        const transitions = tx.transitions || tx.execution?.transitions || [];
        const hasMatchingFunction = transitions.some((transition: any) => {
          const functionName = transition.function || transition.id?.function || '';
          return functionName === options.functionName;
        });

        if (!hasMatchingFunction) {
          return {
            verified: false,
            transaction,
            message: `Transaction does not call function ${options.functionName}`
          };
        }
      }

      // Step 5: If expectedOutputsCount is provided, verify the number of output records
      if (options?.expectedOutputsCount !== undefined) {
        // Try to extract the number of output records from the transaction
        // Different transaction format versions may differ, so handle compatibly
        let actualOutputsCount = 0;

        // Method 1: Get from execution.outputs
        if (tx.execution?.outputs) {
          actualOutputsCount = tx.execution.outputs.length;
        }
        // Method 2: Get from transitions' outputs
        else if (tx.transitions || tx.execution?.transitions) {
          const transitions = tx.transitions || tx.execution.transitions || [];
          actualOutputsCount = transitions.reduce((count: number, transition: any) => {
            const outputs = transition.outputs || [];
            return count + outputs.length;
          }, 0);
        }
        // Method 3: Get from transaction.outputs
        else if (tx.outputs) {
          actualOutputsCount = tx.outputs.length;
        }

        if (actualOutputsCount !== options.expectedOutputsCount) {
          return {
            verified: false,
            transaction,
            message: `Expected ${options.expectedOutputsCount} output records, but found ${actualOutputsCount}`
          };
        }
      }

      // All verifications passed
      return {
        verified: true,
        transaction,
        message: `Transaction ${transactionId} verified successfully on chain`
      };
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // If the query fails, the transaction may not exist or there may be a network error
      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to verify record on chain',
        { transactionId, originalError: error }
      );
    }
  }
}
