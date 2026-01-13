import { ServiceError } from '@/lib/service-errors';
import { WalletError } from '@/services/WalletService/IWalletService';
import { ProtocolError } from '@/services/AleoProtocolService/IAleoProtocolService';

/**
 * 用户友好的错误类型（面向 UI 层）
 */
export enum ErrorType {
  // 钱包相关
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  WALLET_NOT_INSTALLED = 'WALLET_NOT_INSTALLED',
  WALLET_CONNECTION_FAILED = 'WALLET_CONNECTION_FAILED',
  WALLET_NETWORK_MISMATCH = 'WALLET_NETWORK_MISMATCH',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  
  // 交易相关
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  BROADCAST_FAILED = 'BROADCAST_FAILED',
  
  // 发票相关
  INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',
  INVOICE_ALREADY_PAID = 'INVOICE_ALREADY_PAID',
  INVOICE_CANCELLED = 'INVOICE_CANCELLED',
  INVALID_INVOICE_DATA = 'INVALID_INVOICE_DATA',
  
  // 系统错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 应用级错误类
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
 * 错误消息映射表
 */
export const ERROR_MESSAGES: Record<ErrorType, { title: string; description: string }> = {
  [ErrorType.WALLET_NOT_CONNECTED]: {
    title: '钱包未连接',
    description: '请先连接您的 Aleo 钱包'
  },
  [ErrorType.WALLET_NOT_INSTALLED]: {
    title: '未检测到钱包插件',
    description: '未检测到 Leo Wallet 插件，请先安装插件并刷新页面'
  },
  [ErrorType.WALLET_CONNECTION_FAILED]: {
    title: '钱包连接失败',
    description: '无法连接到钱包，请在钱包中确认授权并重试'
  },
  [ErrorType.WALLET_NETWORK_MISMATCH]: {
    title: '网络不匹配',
    description: '请在钱包中切换到正确的网络'
  },
  [ErrorType.INSUFFICIENT_BALANCE]: {
    title: '余额不足',
    description: '您的账户余额不足以完成此操作'
  },
  [ErrorType.TRANSACTION_FAILED]: {
    title: '交易失败',
    description: '交易执行失败，请稍后重试'
  },
  [ErrorType.TRANSACTION_REJECTED]: {
    title: '交易已拒绝',
    description: '您已取消此次交易'
  },
  [ErrorType.PROOF_GENERATION_FAILED]: {
    title: '证明生成失败',
    description: 'ZK 证明生成失败，请重试'
  },
  [ErrorType.BROADCAST_FAILED]: {
    title: '广播失败',
    description: '交易广播到网络失败，请检查网络连接'
  },
  [ErrorType.INVOICE_NOT_FOUND]: {
    title: '发票不存在',
    description: '未找到指定的发票'
  },
  [ErrorType.INVOICE_ALREADY_PAID]: {
    title: '发票已支付',
    description: '此发票已经完成支付'
  },
  [ErrorType.INVOICE_CANCELLED]: {
    title: '发票已取消',
    description: '此发票已被取消'
  },
  [ErrorType.INVALID_INVOICE_DATA]: {
    title: '发票数据无效',
    description: '发票数据格式不正确'
  },
  [ErrorType.NETWORK_ERROR]: {
    title: '网络错误',
    description: '网络连接失败，请检查您的网络连接'
  },
  [ErrorType.STORAGE_ERROR]: {
    title: '存储错误',
    description: '本地数据存储失败'
  },
  [ErrorType.DECRYPTION_FAILED]: {
    title: '解密失败',
    description: '无法解密数据，请检查您的私钥'
  },
  [ErrorType.UNKNOWN_ERROR]: {
    title: '未知错误',
    description: '发生了意外错误，请稍后重试'
  }
};

/**
 * Service 错误到 AppError 的映射表
 */
const SERVICE_ERROR_MAPPINGS: Record<string, Record<string, ErrorType>> = {
  WalletService: {
    [WalletError.NOT_INSTALLED]: ErrorType.WALLET_NOT_INSTALLED,
    [WalletError.USER_REJECTED]: ErrorType.TRANSACTION_REJECTED, // 用户拒绝连接应该视为交易拒绝
    [WalletError.INSUFFICIENT_FEE]: ErrorType.INSUFFICIENT_BALANCE,
    [WalletError.NETWORK_MISMATCH]: ErrorType.WALLET_NETWORK_MISMATCH,
    [WalletError.UNAUTHORIZED]: ErrorType.WALLET_CONNECTION_FAILED, // 连接失败（而不是"未连接"状态）
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
 * 将任何错误转换为 AppError
 */
export function toAppError(error: any): AppError {
  if (error instanceof AppError) {
    return error;
  }

  // 处理所有 ServiceError
  if (error instanceof ServiceError) {
    const mapping = SERVICE_ERROR_MAPPINGS[error.serviceName];
    const errorType = mapping?.[error.code] || ErrorType.UNKNOWN_ERROR;
    const message = ERROR_MESSAGES[errorType];

    // 优先展示 ServiceError.details.hint（如果有），否则使用默认文案
    const hint =
      typeof error?.details?.hint === 'string' ? error.details.hint.trim() : '';
    const description = hint ? `${message.description}（${hint}）` : message.description;

    return new AppError(
      errorType,
      message.title,
      description,
      error
    );
  }

  // 处理其他未知错误
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

  // 默认未知错误
  return new AppError(
    ErrorType.UNKNOWN_ERROR,
    ERROR_MESSAGES[ErrorType.UNKNOWN_ERROR].title,
    error?.message || ERROR_MESSAGES[ErrorType.UNKNOWN_ERROR].description,
    error
  );
}

