import { 
  AleoAddress, AleoField, AleoTransactionId, InvoiceStatus, Microcredits 
} from '@/lib/types';
import { createServiceError } from '@/lib/service-errors';

/**
 * 协议服务错误码
 * 处理网络与节点通信的各类风险
 */
export enum ProtocolError {
  NODE_CONNECTION_FAILED = 'NODE_CONNECTION_FAILED', // 无法连接到 Aleo节点 (RPC 失败)
  INVALID_RECORD = 'INVALID_RECORD',           // Record 格式解析错误
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED', // 节点拒绝接收交易（如手续费过低或逻辑冲突）
  SYNC_TIMEOUT = 'SYNC_TIMEOUT',               // 区块同步超时
  MAPPING_NOT_FOUND = 'MAPPING_NOT_FOUND'      // 链上找不到指定的 Mapping（如程序未部署）
}

/**
 * 协议服务错误类
 */
export const ProtocolServiceError = createServiceError<ProtocolError>('AleoProtocol');
export type ProtocolServiceError = InstanceType<typeof ProtocolServiceError>;

export interface IAleoProtocolService {
  /**
   * 获取当前链的最新区块高度
   * 用于 Controller 决定扫描的终点
   * @throws {ProtocolServiceError} 可能抛出 NODE_CONNECTION_FAILED
   */
  getLatestBlockHeight(): Promise<number>;

  /**
   * 获取公开余额（从链上 Mapping 查询）
   * 查询 credits.aleo 程序的 account mapping
   * @param address Aleo 地址
   * @returns 公开余额（Microcredits）
   * @throws {ProtocolServiceError} 可能抛出 NODE_CONNECTION_FAILED
   */
  getPublicBalance(address: AleoAddress): Promise<Microcredits>;

  /**
   * 获取指定地址在特定程序下的所有加密Record
   * @param programId 程序标识符 (如: "zk_invoice.aleo")
   * @param address 用户地址
   * @param startHeight 起始扫描高度
   * @returns 原始密文字符串数组
   * @throws {ProtocolServiceError} 可能抛出 NODE_CONNECTION_FAILED
   */
  fetchRawRecords(
    programId: string, 
    address: AleoAddress, 
    startHeight: number
  ): Promise<string[]>;

  /**
   * 查询链上程序的 Mapping 值（通用方法）
   * 可以查询任意程序的任意 Mapping
   * @param programId 程序标识符（如: "zk_invoice.aleo"）
   * @param mappingName Mapping 名称（如: "invoice_status"）
   * @param key Mapping 的键值（Field 类型）
   * @returns Mapping 的值（字符串格式），如果不存在则返回 null
   * @throws {ProtocolServiceError} 可能抛出 MAPPING_NOT_FOUND, NODE_CONNECTION_FAILED
   */
  getProgramMappingValue(
    programId: string,
    mappingName: string,
    key: AleoField
  ): Promise<string | null>;

  /**
   * 广播已生成的零知识证明交易到 Aleo 网络
   * @param transactionPayload 证明数据载体
   * @returns 返回生成的交易 ID
   * @throws {ProtocolServiceError} 可能抛出 TRANSACTION_REJECTED, NODE_CONNECTION_FAILED
   */
  broadcastTransaction(transactionPayload: any): Promise<AleoTransactionId>;

  /**
   * 等待交易确认
   * @param txId 交易 ID
   * @param timeoutMS 超时毫秒数
   * @returns 确认后的回执信息
   * @throws {ProtocolServiceError} 可能抛出 SYNC_TIMEOUT, NODE_CONNECTION_FAILED
   */
  waitForTransaction(txId: AleoTransactionId, timeoutMS?: number): Promise<any>;

  /**
   * 估算执行费用（Microcredits）
   * 通过构建 Authorization 并使用 SDK 的 estimateFeeForAuthorization 进行预估
   * @param programName 程序名称（如: "zk_invoice.aleo"）
   * @param functionName 函数名称（如: "create_invoice"）
   * @param inputs 函数输入参数数组
   * @returns 估算的执行费用（Microcredits），已增加 20% 冗余
   * @throws {ProtocolServiceError} 可能抛出 NODE_CONNECTION_FAILED
   */
  estimateExecutionFee(
    programName: string,
    functionName: string,
    inputs: string[]
  ): Promise<Microcredits>;

  /**
   * 验证生成的 record 是否上链成功
   * 通过查询交易详情来验证交易是否已确认，并可选择性地验证交易中是否包含预期的 record
   * @param transactionId 交易 ID
   * @param options 可选的验证选项
   * @param options.programId 程序 ID（如: "zk_invoice.aleo"），用于验证交易是否属于该程序
   * @param options.functionName 函数名称（如: "create_invoice"），用于验证交易调用的函数
   * @param options.expectedOutputsCount 预期的输出 record 数量，用于验证交易是否产生了预期的 record
   * @returns 验证结果对象，包含是否成功、交易详情等信息
   * @throws {ProtocolServiceError} 可能抛出 NODE_CONNECTION_FAILED, TRANSACTION_REJECTED
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