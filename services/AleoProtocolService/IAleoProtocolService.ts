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
   * 查询链上发票状态Mapping
   * 对应合约中的 `mapping invoice_status: field => u8`
   * @param invoiceId 发票的唯一标识 Field
   * @returns 合约定义的 InvoiceStatus 枚举值
   * @throws {ProtocolServiceError} 可能抛出 MAPPING_NOT_FOUND, NODE_CONNECTION_FAILED
   */
  getInvoiceMappingStatus(invoiceId: AleoField): Promise<InvoiceStatus>;

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
}