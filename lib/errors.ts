import { ServiceError } from '@/lib/service-errors';
import { WalletError } from '@/services/WalletService/IWalletService';
import { ProtocolError } from '@/services/AleoProtocolService/IAleoProtocolService';

/**
 * User-friendly error types (for the UI layer)
 */
export enum ErrorType {
  // Wallet related
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  WALLET_NOT_INSTALLED = 'WALLET_NOT_INSTALLED',
  WALLET_CONNECTION_FAILED = 'WALLET_CONNECTION_FAILED',
  WALLET_NETWORK_MISMATCH = 'WALLET_NETWORK_MISMATCH',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',

  // Transaction related
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  BROADCAST_FAILED = 'BROADCAST_FAILED',

  // Invoice related
  INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',
  INVOICE_ALREADY_PAID = 'INVOICE_ALREADY_PAID',
  INVOICE_CANCELLED = 'INVOICE_CANCELLED',
  INVALID_INVOICE_DATA = 'INVALID_INVOICE_DATA',

  // System errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Application-level error class
 */
export class AppError extends Error {
  constructor(
    public type: ErrorType,
    public title: string,
    public description?: string,
    public originalError?: any
  ) {
    super(title);
    this.name = 'AppError';
  }
}

/**
 * Error message mapping table
 */
export const ERROR_MESSAGES: Record<ErrorType, { title: string; description: string }> = {
  [ErrorType.WALLET_NOT_CONNECTED]: {
    title: 'Wallet Not Connected',
    description: 'Please connect your Aleo wallet first'
  },
  [ErrorType.WALLET_NOT_INSTALLED]: {
    title: 'Wallet Extension Not Detected',
    description: 'Leo Wallet extension not detected. Please install the extension and refresh the page'
  },
  [ErrorType.WALLET_CONNECTION_FAILED]: {
    title: 'Wallet Connection Failed',
    description: 'Unable to connect to wallet. Please confirm authorization in your wallet and try again'
  },
  [ErrorType.WALLET_NETWORK_MISMATCH]: {
    title: 'Network Mismatch',
    description: 'Please switch to the correct network in your wallet'
  },
  [ErrorType.INSUFFICIENT_BALANCE]: {
    title: 'Insufficient Balance',
    description: 'Your account balance is insufficient to complete this operation'
  },
  [ErrorType.TRANSACTION_FAILED]: {
    title: 'Transaction Failed',
    description: 'Transaction execution failed. Please try again later'
  },
  [ErrorType.TRANSACTION_REJECTED]: {
    title: 'Transaction Rejected',
    description: 'You have cancelled this transaction'
  },
  [ErrorType.PROOF_GENERATION_FAILED]: {
    title: 'Proof Generation Failed',
    description: 'ZK proof generation failed. Please try again'
  },
  [ErrorType.BROADCAST_FAILED]: {
    title: 'Broadcast Failed',
    description: 'Failed to broadcast transaction to the network. Please check your network connection'
  },
  [ErrorType.INVOICE_NOT_FOUND]: {
    title: 'Invoice Not Found',
    description: 'The specified invoice was not found'
  },
  [ErrorType.INVOICE_ALREADY_PAID]: {
    title: 'Invoice Already Paid',
    description: 'This invoice has already been paid'
  },
  [ErrorType.INVOICE_CANCELLED]: {
    title: 'Invoice Cancelled',
    description: 'This invoice has been cancelled'
  },
  [ErrorType.INVALID_INVOICE_DATA]: {
    title: 'Invalid Invoice Data',
    description: 'The invoice data format is incorrect'
  },
  [ErrorType.NETWORK_ERROR]: {
    title: 'Network Error',
    description: 'Network connection failed. Please check your network connection'
  },
  [ErrorType.STORAGE_ERROR]: {
    title: 'Storage Error',
    description: 'Local data storage failed'
  },
  [ErrorType.DECRYPTION_FAILED]: {
    title: 'Decryption Failed',
    description: 'Unable to decrypt data. Please check your private key'
  },
  [ErrorType.UNKNOWN_ERROR]: {
    title: 'Unknown Error',
    description: 'An unexpected error occurred. Please try again later'
  }
};

/**
 * Service error to AppError mapping table
 */
const SERVICE_ERROR_MAPPINGS: Record<string, Record<string, ErrorType>> = {
  WalletService: {
    [WalletError.NOT_INSTALLED]: ErrorType.WALLET_NOT_INSTALLED,
    [WalletError.USER_REJECTED]: ErrorType.TRANSACTION_REJECTED, // User rejecting connection should be treated as transaction rejection
    [WalletError.INSUFFICIENT_FEE]: ErrorType.INSUFFICIENT_BALANCE,
    [WalletError.NETWORK_MISMATCH]: ErrorType.WALLET_NETWORK_MISMATCH,
    [WalletError.UNAUTHORIZED]: ErrorType.WALLET_CONNECTION_FAILED, // Connection failed (not "not connected" state)
    [WalletError.DECRYPTION_FAILED]: ErrorType.DECRYPTION_FAILED
  },
  AleoProtocol: {
    [ProtocolError.NODE_CONNECTION_FAILED]: ErrorType.NETWORK_ERROR,
    [ProtocolError.INVALID_RECORD]: ErrorType.UNKNOWN_ERROR,
    [ProtocolError.TRANSACTION_REJECTED]: ErrorType.TRANSACTION_REJECTED,
    [ProtocolError.SYNC_TIMEOUT]: ErrorType.NETWORK_ERROR,
    [ProtocolError.MAPPING_NOT_FOUND]: ErrorType.INVOICE_NOT_FOUND
  }
};

/**
 * Convert any error to an AppError
 */
export function toAppError(error: any): AppError {
  if (error instanceof AppError) {
    return error;
  }

  // Handle all ServiceErrors
  if (error instanceof ServiceError) {
    const mapping = SERVICE_ERROR_MAPPINGS[error.serviceName];
    const errorType = mapping?.[error.code] || ErrorType.UNKNOWN_ERROR;
    const message = ERROR_MESSAGES[errorType];

    // Prefer displaying ServiceError.details.hint (if available), otherwise use default message
    const hint =
      typeof error?.details?.hint === 'string' ? error.details.hint.trim() : '';
    const description = hint ? `${message.description} (${hint})` : message.description;

    return new AppError(
      errorType,
      message.title,
      description,
      error
    );
  }

  // Handle other unknown errors
  const errorMessage = error?.message?.toLowerCase() || '';

  if (errorMessage.includes('user rejected') || errorMessage.includes('user denied')) {
    return new AppError(
      ErrorType.TRANSACTION_REJECTED,
      ERROR_MESSAGES[ErrorType.TRANSACTION_REJECTED].title,
      ERROR_MESSAGES[ErrorType.TRANSACTION_REJECTED].description,
      error
    );
  }

  if (errorMessage.includes('insufficient')) {
    return new AppError(
      ErrorType.INSUFFICIENT_BALANCE,
      ERROR_MESSAGES[ErrorType.INSUFFICIENT_BALANCE].title,
      ERROR_MESSAGES[ErrorType.INSUFFICIENT_BALANCE].description,
      error
    );
  }

  if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
    return new AppError(
      ErrorType.NETWORK_ERROR,
      ERROR_MESSAGES[ErrorType.NETWORK_ERROR].title,
      ERROR_MESSAGES[ErrorType.NETWORK_ERROR].description,
      error
    );
  }

  // Default unknown error
  return new AppError(
    ErrorType.UNKNOWN_ERROR,
    ERROR_MESSAGES[ErrorType.UNKNOWN_ERROR].title,
    error?.message || ERROR_MESSAGES[ErrorType.UNKNOWN_ERROR].description,
    error
  );
}

