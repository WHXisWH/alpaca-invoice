import { Microcredits } from '@/lib/types';
import {
  IWalletService,
  WalletServiceError,
  WalletError,
  RequestTransactionParams
} from './IWalletService';
import { PROGRAM_ID as DEFAULT_PROGRAM_ID } from '@/lib/contract';

/**
 * WalletService implementation class
 *
 * Responsibilities: Encapsulates wallet operations and provides a business-layer interface
 *
 * Advantages:
 * - Does not use a complex Adapter pattern
 * - Directly receives the wallet instance (from useWallet)
 * - Can manage internal state (e.g., event listeners)
 * - Maintains an object-oriented architectural style
 *
 * Usage:
 * ```typescript
 * const wallet = useWallet();
 * const walletService = new WalletService(wallet);
 * await walletService.connect();
 * ```
 */
export class WalletService {
  private wallet: IWalletService;

  constructor(wallet: IWalletService) {
    this.wallet = wallet;
  }

  /**
   * Connect wallet
   * @throws {WalletServiceError} May throw NOT_INSTALLED, USER_REJECTED, NETWORK_MISMATCH
   */
  async connect(): Promise<void> {
    // Check if wallet is installed
    if (!this.wallet) {
      console.error('❌ [WalletService] Wallet instance does not exist');
      throw new WalletServiceError(
        WalletError.NOT_INSTALLED,
        'Aleo wallet extension not detected. Please install Leo Wallet.',
        { hint: 'Visit https://leo.app to download' }
      );
    }

    console.log('🔍 [WalletService] Starting wallet connection', {
      hasConnectMethod: typeof this.wallet.connect === 'function'
    });

    try {
      await this.wallet.connect();
      console.log('✅ [WalletService] this.wallet.connect() Promise resolved');
    } catch (error: any) {
      // Already a WalletServiceError, rethrow directly
      if (error instanceof WalletServiceError) {
        console.log('🔍 [WalletService] Caught WalletServiceError, rethrowing:', {
          code: error.code,
          message: error.message,
          details: error.details
        });
        throw error;
      }

      // 🔍 Log detailed information about the original error
      console.error('❌ [WalletService] Caught unknown error, analyzing:', {
        error,
        errorType: error?.constructor?.name,
        message: error?.message,
        code: error?.code,
        errorCode: error?.error?.code,
        name: error?.name,
        stack: error?.stack,
        stringified: String(error)
      });

      // Improved user rejection detection (more comprehensive scenarios)
      const errorMessage = error?.message?.toLowerCase() || '';
      const errorString = String(error).toLowerCase();
      const errorCode = error?.code || error?.error?.code;

      // More comprehensive user rejection scenario detection
      if (
        errorMessage.includes('reject') ||
        errorMessage.includes('denied') ||
        errorMessage.includes('cancel') ||
        errorMessage.includes('user cancelled') ||
        errorString.includes('reject') ||
        errorString.includes('denied') ||
        errorString.includes('cancel') ||
        errorCode === 4001 || // EIP-1193 rejection code
        errorCode === 'ACTION_REJECTED' ||
        errorCode === 'USER_REJECTED'
      ) {
        console.log('🔍 [WalletService] Identified as user rejection');
        throw new WalletServiceError(
          WalletError.USER_REJECTED,
          'User rejected the connection request',
          { originalError: error.message || error }
        );
      }

      // Network mismatch
      if (error?.message?.includes('network')) {
        console.log('🔍 [WalletService] Identified as network mismatch');
        throw new WalletServiceError(
          WalletError.NETWORK_MISMATCH,
          'Wallet network does not match required network',
          { originalError: error.message }
        );
      }

      // Unknown error - but provide more detailed error information
      console.error('❌ [WalletService] Unable to identify error type, classifying as UNAUTHORIZED');
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Failed to connect wallet',
        {
          originalError: error,
          hint: error?.message || 'Please check your wallet and try again'
        }
      );
    }
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    try {
      await this.wallet.disconnect();
    } catch (error: any) {
      // Disconnect failure is usually not fatal, just log it
      console.warn('Failed to disconnect wallet:', error);
    }
  }

  /**
   * Parse microcredits value
   * Supported formats:
   * - "5000000" (plain numeric string)
   * - "5000000u64.private" (Aleo private type format)
   * @param microcredits Raw microcredits value
   * @returns Parsed BigInt value
   */
  private parseMicrocredits(microcredits: string | undefined): bigint {
    if (!microcredits) {
      return 0n;
    }

    // If in "5000000u64.private" format, extract the numeric part
    // Pattern: digits + optional type suffix (e.g., u64.private)
    const match = microcredits.match(/^(\d+)/);
    if (match) {
      return BigInt(match[1]);
    }

    // If parsing fails, try direct conversion
    try {
      return BigInt(microcredits);
    } catch {
      return 0n;
    }
  }

  /**
   * Get private balance (calculated from wallet Records)
   * @param publicKey Wallet public key address
   * @returns Private balance (Microcredits)
   * @throws {WalletServiceError} May throw UNAUTHORIZED, DECRYPTION_FAILED
   *
   * Note:
   * No need to manage ViewKey yourself; the wallet adapter's requestRecords automatically
   * uses the wallet's internal ViewKey to decrypt credits Records belonging to the current user.
   */
  async getPrivateBalance(publicKey: string): Promise<Microcredits> {
    if (!publicKey) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet not connected. Please connect first.'
      );
    }

    try {
      const requestRecords = this.wallet.requestRecords || this.wallet.requestRecordPlaintexts;

      if (!requestRecords) {
        return 0n;
      }

      // Request Records for credits.aleo
      const creditsResponse = await requestRecords('credits.aleo');
      const records = creditsResponse?.records || [];

      // Calculate private balance
      let privateBalance = 0n;
      for (const record of records) {
        if (!record.spent && record.data?.microcredits) {
          const amount = this.parseMicrocredits(record.data.microcredits);
          privateBalance += amount;
        }
      }

      return privateBalance;
    } catch (error: any) {
      throw new WalletServiceError(
        WalletError.DECRYPTION_FAILED,
        'Failed to get private balance',
        { originalError: error }
      );
    }
  }

  /**
   * Get fee Records
   * @param amount Minimum required amount
   * @param publicKey Wallet public key address
   * @returns List of Record strings that meet the criteria
   * @throws Errors such as insufficient balance
   *
   * Strategy:
   * 1. Strategy 1: Minimum satisfaction - find a single Record with the smallest denomination >= the fee
   * 2. Strategy 2: Multi-record combination - find a combination that just meets or is closest to the required amount (minimizing change)
   */
  async getFeeRecords(amount: Microcredits, publicKey: string): Promise<string[]> {
    if (!publicKey) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet not connected. Please connect first.'
      );
    }

    const requestRecords = this.wallet.requestRecords || this.wallet.requestRecordPlaintexts;

    if (!requestRecords) {
      throw new WalletServiceError(
        WalletError.INSUFFICIENT_FEE,
        'No fee records available'
      );
    }

    try {
      const creditsResponse = await requestRecords('credits.aleo');
      const records = creditsResponse?.records || [];

      // Filter unspent Records with amount > 0 and convert to objects with amount info
      const unspentRecords = records
        .filter((r: any) => !r.spent)
        .map((r: any) => ({
          record: r,
          amount: this.parseMicrocredits(r.data?.microcredits),
          recordString: typeof r === 'string' ? r : JSON.stringify(r)
        }))
        .filter((r: any) => r.amount > 0n); // Filter out records with zero amount

      if (unspentRecords.length === 0) {
        throw new WalletServiceError(
          WalletError.INSUFFICIENT_FEE,
          'No unspent fee records available',
          { requiredAmount: amount.toString() }
        );
      }

      // Strategy 1: Minimum satisfaction - find a single Record with the smallest denomination >= the fee
      const suitableRecords = unspentRecords.filter(r => r.amount >= amount);
      if (suitableRecords.length > 0) {
        // Find the smallest qualifying Record
        const minRecord = suitableRecords.reduce((min, current) =>
          current.amount < min.amount ? current : min
        );
        return [minRecord.recordString];
      }

      // Strategy 2: Multi-record combination - find the optimal combination (total closest to the required amount)
      const bestCombination = this.findBestRecordCombination(unspentRecords, amount);

      if (bestCombination.length === 0) {
        const totalAvailable = unspentRecords.reduce((sum, r) => sum + r.amount, 0n);
        throw new WalletServiceError(
          WalletError.INSUFFICIENT_FEE,
          'Insufficient fee records',
          {
            requiredAmount: amount.toString(),
            availableAmount: totalAvailable.toString()
          }
        );
      }

      return bestCombination.map(r => r.recordString);
    } catch (error: any) {
      // Already a WalletServiceError, rethrow directly
      if (error instanceof WalletServiceError) {
        throw error;
      }

      throw new WalletServiceError(
        WalletError.DECRYPTION_FAILED,
        'Failed to get fee records',
        { originalError: error }
      );
    }
  }

  /**
   * Find the optimal combination of Records
   * Uses dynamic programming to find the combination with total >= amount and closest to amount
   */
  private findBestRecordCombination(
    records: Array<{ record: any; amount: bigint; recordString: string }>,
    targetAmount: bigint
  ): Array<{ record: any; amount: bigint; recordString: string }> {
    let bestCombination: typeof records = [];
    let bestSum = BigInt(0);
    let minExcess = BigInt(Number.MAX_SAFE_INTEGER);

    // Try all possible combinations (using bitmask)
    const n = records.length;
    const maxMask = 1 << n; // 2^n

    for (let mask = 1; mask < maxMask; mask++) {
      const combination: typeof records = [];
      let sum = BigInt(0);

      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          combination.push(records[i]);
          sum += records[i].amount;
        }
      }

      // If this combination meets the condition (total >= target amount)
      if (sum >= targetAmount) {
        const excess = sum - targetAmount;

        // If this is the first qualifying combination, or has less change, or same change but uses fewer Records
        if (
          bestCombination.length === 0 ||
          excess < minExcess ||
          (excess === minExcess && combination.length < bestCombination.length)
        ) {
          bestCombination = combination;
          bestSum = sum;
          minExcess = excess;

          // If it exactly meets the requirement (no change needed), return immediately
          if (excess === BigInt(0)) {
            break;
          }
        }
      }
    }

    return bestCombination;
  }

  /**
   * Sign a message (used for identity verification or audit authorization)
   * @param message The message to sign
   * @param publicKey Wallet public key address
   * @returns Signature string
   * @throws {WalletServiceError} May throw UNAUTHORIZED, USER_REJECTED
   */
  async signMessage(message: string, publicKey: string): Promise<string> {
    if (!publicKey) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet not connected. Please connect first.'
      );
    }

    if (!message || message.trim() === '') {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Message cannot be empty'
      );
    }

    if (!this.wallet.signMessage) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet does not support signMessage'
      );
    }

    try {
      const signature = await this.wallet.signMessage(message);

      if (!signature || signature.trim() === '') {
        throw new WalletServiceError(
          WalletError.UNAUTHORIZED,
          'Signature request returned empty result'
        );
      }

      return signature;
    } catch (error: any) {
      // Already a WalletServiceError, rethrow directly
      if (error instanceof WalletServiceError) {
        throw error;
      }

      // User rejection
      if (error?.message?.includes('reject') || error?.message?.includes('denied')) {
        throw new WalletServiceError(
          WalletError.USER_REJECTED,
          'User rejected signature request',
          { originalError: error.message }
        );
      }

      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Failed to sign message',
        { originalError: error }
      );
    }
  }

  /**
   * Request Records (wraps the wallet adapter's requestRecords method)
   * @param program Program ID (e.g., 'zk_invoice_v2_2.aleo' or 'credits.aleo')
   * @returns An object containing a records array
   * @throws {WalletServiceError} May throw UNAUTHORIZED, DECRYPTION_FAILED
   *
   * Note:
   * - Wraps the wallet adapter's requestRecords or requestRecordPlaintexts method
   * - Automatically handles return format, uniformly returning { records: any[] }
   * - The wallet adapter automatically uses the wallet's internal ViewKey to decrypt Records belonging to the current user
   */
  async requestRecords(program: string): Promise<{ records: any[] }> {
    if (!this.wallet) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet not connected. Please connect first.'
      );
    }

    const requestRecords = this.wallet.requestRecords || this.wallet.requestRecordPlaintexts;

    if (!requestRecords) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet does not support requestRecords'
      );
    }

    try {
      const response = await requestRecords(program);
      // Unify return format: ensure { records: any[] } is returned
      if (Array.isArray(response)) {
        return { records: response };
      }
      return response?.records ? { records: response.records } : { records: [] };
    } catch (error: any) {
      throw new WalletServiceError(
        WalletError.DECRYPTION_FAILED,
        'Failed to request records',
        { originalError: error }
      );
    }
  }

  /**
   * Request transaction creation
   * @param params Transaction parameters object
   * @returns Transaction result (includes transactionId, etc.)
   * @throws {WalletServiceError} May throw UNAUTHORIZED, USER_REJECTED, NOT_INSTALLED
   *
   * Note:
   * - This is a simplified interface wrapping the wallet adapter's requestTransaction method
   * - If feeRecord is provided, it will be used to pay the fee (feePrivate: true)
   * - If feeRecord is not provided, the wallet will automatically select a Record to pay the fee (feePrivate: false)
   */
  async requestTransaction(params: RequestTransactionParams): Promise<any> {
    const {
      functionName,
      inputs,
      publicKey,
      programId = DEFAULT_PROGRAM_ID,
      feeRecord,
      fee = 250_000,
      chainId
    } = params;

    if (!publicKey) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet not connected. Please connect first.'
      );
    }

    if (!this.wallet) {
      throw new WalletServiceError(
        WalletError.NOT_INSTALLED,
        'Wallet not found. Please install Leo Wallet.',
        { hint: 'Visit https://leo.app to download' }
      );
    }

    if (!this.wallet.requestTransaction) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet does not support requestTransaction'
      );
    }

    // If chainId is not provided, get it from environment variables
    let finalChainId = chainId;
    if (!finalChainId) {
      const { getChainIdFromNetwork, getNetworkFromEnv } = await import('@/lib/network');
      finalChainId = getChainIdFromNetwork(getNetworkFromEnv());
    }

    try {
      // Build transaction request parameters
      // Note: If feeRecord is provided, set feePrivate: true so the wallet uses private fee
      // The feeRecord itself doesn't need to be passed as a parameter; the wallet will automatically select an appropriate Record
      const transactionRequest = {
        address: publicKey,
        chainId: finalChainId,
        transitions: [{
          program: programId,
          functionName: functionName,
          inputs: inputs
        }],
        fee: fee,
        feePrivate: feeRecord !== undefined // If feeRecord is provided, use private fee
      };

      // Call the wallet adapter's requestTransaction method
      // Note: The wallet adapter will automatically select an appropriate Record to pay the fee based on the feePrivate flag
      const result = await this.wallet.requestTransaction(transactionRequest);

      if (!result) {
        throw new WalletServiceError(
          WalletError.UNAUTHORIZED,
          'Transaction request returned empty result'
        );
      }

      return result;
    } catch (error: any) {
      // Already a WalletServiceError, rethrow directly
      if (error instanceof WalletServiceError) {
        throw error;
      }

      // User rejection
      const errorMessage = error?.message?.toLowerCase() || '';
      const errorString = String(error).toLowerCase();
      const errorCode = error?.code || error?.error?.code;

      if (
        errorMessage.includes('reject') ||
        errorMessage.includes('denied') ||
        errorMessage.includes('cancel') ||
        errorMessage.includes('user cancelled') ||
        errorString.includes('reject') ||
        errorString.includes('denied') ||
        errorString.includes('cancel') ||
        errorCode === 4001 ||
        errorCode === 'ACTION_REJECTED' ||
        errorCode === 'USER_REJECTED'
      ) {
        throw new WalletServiceError(
          WalletError.USER_REJECTED,
          'User rejected the transaction request',
          { originalError: error.message || error }
        );
      }

      // Network mismatch (case-insensitive)
      if (
        errorMessage.includes('network') ||
        errorString.includes('network')
      ) {
        throw new WalletServiceError(
          WalletError.NETWORK_MISMATCH,
          'Wallet network does not match required network',
          { originalError: error.message }
        );
      }

      // Unknown error
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Failed to request transaction',
        {
          originalError: error,
          hint: error?.message || 'Please check your wallet and try again'
        }
      );
    }
  }

  /**
   * Query transaction status
   * @param transactionId Transaction ID
   * @returns Transaction status string
   * @throws {WalletServiceError} May throw UNAUTHORIZED
   *
   * Note:
   * - Wraps the wallet adapter's transactionStatus method
   * - Used to query the status of submitted transactions
   */
  async transactionStatus(transactionId: string): Promise<string> {
    if (!this.wallet) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet not connected. Please connect first.'
      );
    }

    if (!this.wallet.transactionStatus) {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Wallet does not support transactionStatus'
      );
    }

    if (!transactionId || transactionId.trim() === '') {
      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Transaction ID cannot be empty'
      );
    }

    try {
      const status = await this.wallet.transactionStatus(transactionId);
      return status;
    } catch (error: any) {
      // Already a WalletServiceError, rethrow directly
      if (error instanceof WalletServiceError) {
        throw error;
      }

      throw new WalletServiceError(
        WalletError.UNAUTHORIZED,
        'Failed to get transaction status',
        { originalError: error }
      );
    }
  }
}
