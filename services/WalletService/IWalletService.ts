import { createServiceError } from '@/lib/service-errors';

/**
 * 钱包服务错误码
 */
export enum WalletError {
  NOT_INSTALLED = 'NOT_INSTALLED',             // 未检测到插件
  USER_REJECTED = 'USER_REJECTED',            // 用户在插件弹窗中点击了"拒绝"或关闭了弹窗
  INSUFFICIENT_FEE = 'INSUFFICIENT_FEE',     // 钱包内没有足够的 credits Record 用于支付手续费
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',    // 钱包当前网络与应用要求不符（如应为 Testnet3）
  UNAUTHORIZED = 'UNAUTHORIZED',           // 在未连接状态下调用了需要授权的接口
  DECRYPTION_FAILED = 'DECRYPTION_FAILED' // 用户拒绝了解密请求或ViewKey派生失败
}

/**
 * 钱包服务错误类
 * 使用工厂函数创建，自动带有类型提示
 */
export const WalletServiceError = createServiceError<WalletError>('WalletService');
export type WalletServiceError = InstanceType<typeof WalletServiceError>;

/**
 * requestTransaction 方法的参数接口（简化版）
 * 用于 WalletService.requestTransaction 方法
 */
export interface RequestTransactionParams {
  /** 要调用的函数名 */
  functionName: string;
  /** 函数输入参数数组 */
  inputs: string[];
  /** 钱包公钥地址 */
  publicKey: string;
  /** 程序ID（默认为 "zk_invoice.aleo"） */
  programId?: string;
  /** 可选的手续费 Record（如果不提供，钱包会自动选择） */
  feeRecord?: string;
  /** 手续费金额（默认为 250000 microcredits） */
  fee?: number;
  /** 链ID（可选，默认从环境变量获取） */
  chainId?: string;
}

/**
 * WalletService 接口
 * 职责：封装钱包操作，处理连接、签名和解密授权
 * 
 * 注意：
 * - 当前使用纯函数实现（见 WalletServiceImpl.ts）
 * - 此接口既可作为服务层接口，也可作为钱包实例的类型约束
 */
export interface IWalletService {
  // 钱包连接方法
  /**
   * 申请连接钱包
   * @throws {WalletServiceError} 可能抛出 NOT_INSTALLED, USER_REJECTED, NETWORK_MISMATCH
   */
  connect(): Promise<void>;

  /**
   * 断开钱包连接并重置授权状态
   */
  disconnect(): Promise<void>;

  /**
   * 对消息进行签名（用于身份校验或审计授权）
   * @param message 要签名的消息
   * @returns 签名后的字符串
   * @throws {WalletServiceError} 可能抛出 USER_REJECTED, UNAUTHORIZED
   */
  signMessage?(message: string): Promise<string>;

  /**
   * 请求 Records
   */
  requestRecords?(program: string): Promise<{ records: any[] }>;
  
  /**
   * 请求 Record 明文
   */
  requestRecordPlaintexts?(program: string): Promise<{ records: any[] }>;

  /**
   * 请求创建交易（钱包适配器的原始方法）
   * @param params 交易参数
   * @returns 交易结果（返回 transactionId 字符串）
   */
  requestTransaction?(params: {
    address: string;
    chainId: string;
    transitions: Array<{
      program: string;
      functionName: string;
      inputs: string[];
    }>;
    fee: number;
    feePrivate: boolean;
  }): Promise<string>;
}