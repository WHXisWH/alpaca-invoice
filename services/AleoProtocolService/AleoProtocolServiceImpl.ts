import {
  AleoAddress,
  AleoField,
  AleoTransactionId,
  InvoiceStatus,
  Microcredits
} from '@/lib/types';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { IAleoProtocolService, ProtocolServiceError, ProtocolError } from './IAleoProtocolService';
import { AleoNetworkClient, ProgramManager } from '@provablehq/sdk';

/**
 * AleoProtocolService 实现类
 * 
 * 职责：与 Aleo 区块链节点交互，查询链上数据和广播交易
 * 
 * 使用 @provablehq/sdk 的 AleoNetworkClient 自动处理 URL 拼接和版本兼容问题
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
   * 获取或创建 ProgramManager 实例（延迟初始化）
   * ProgramManager 可能需要 WASM 初始化，所以采用延迟加载策略
   */
  private getProgramManager(): ProgramManager {
    if (!this.programManager) {
      const baseUrl = this.getBaseUrlForNetwork(this.network);
      // ProgramManager 构造函数: (host?, keyProvider?, recordProvider?, networkClientOptions?)
      // 对于费用估算，我们不需要 keyProvider 和 recordProvider
      this.programManager = new ProgramManager(baseUrl);
    }
    return this.programManager;
  }

  /**
   * 根据网络类型获取基础 RPC URL（用于 AleoNetworkClient）
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
   * 获取当前链的最新区块高度
   * 
   * 使用 AleoNetworkClient.getLatestHeight() 直接获取最新区块高度
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
   * 获取公开余额（从链上 Mapping 查询）
   * 查询 credits.aleo 程序的 account mapping
   * 
   * 使用 AleoNetworkClient.getProgramMappingValue，如果返回 null 则表示余额为 0
   */
  async getPublicBalance(address: AleoAddress): Promise<Microcredits> {
    try {
      const balance = await this.networkClient.getProgramMappingValue(
        'credits.aleo',
        'account',
        address
      );

      // 如果返回 null，即余额为 0
      if (balance === null || balance === undefined) {
        return 0n;
      }

      // 处理返回的余额值（可能是字符串或数字）
      const balanceStr = String(balance).trim();
      
      // 移除可能的单位后缀（如 "u64"）并解析为 bigint
      const cleanBalanceStr = balanceStr
        .replace(/^["']|["']$/g, '') // 移除首尾引号
        .replace(/u64$/i, '') // 移除 u64 后缀（不区分大小写）
        .trim();
      
      return BigInt(cleanBalanceStr || 0);
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }
      
      // 网络错误或其他错误，返回 0（可能是地址没有公开余额）
      console.warn('Failed to get public balance, returning 0:', error);
      return 0n;
    }
  }

  /**
   * 获取指定地址在特定程序下的所有加密Record
   * 
   * 注意：此方法需要私钥才能解密 Records。
   * AleoNetworkClient.findUnspentRecords 需要 PrivateKey 参数。
   * 
   * 建议在上层 Service（如 WalletService）中处理 Record 查询，
   * 因为只有 Wallet 层才持有用户私钥。
   * 
   * 如需实现，参考代码：
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
   * 查询链上发票状态Mapping
   * 
   * 注意：当前 zk_invoice.aleo 合约采用 Record-based 架构（UTXO 模型），
   * 不使用公开 Mapping 存储状态。所有状态通过加密 Record 传递。
   * 
   * 如果未来合约升级为使用 Mapping，可以使用以下实现：
   * const status = await this.networkClient.getProgramMappingValue(
   *   'zk_invoice.aleo', 
   *   'invoice_status', 
   *   invoiceId
   * );
   */
  async getInvoiceMappingStatus(invoiceId: AleoField): Promise<InvoiceStatus> {
    try {
      // 尝试查询 Mapping（如果合约使用 Mapping）
      const status = await this.networkClient.getProgramMappingValue(
        'zk_invoice.aleo',
        'invoice_status',
        invoiceId
      );

      if (status === null || status === undefined) {
        throw new ProtocolServiceError(
          ProtocolError.MAPPING_NOT_FOUND,
          'Invoice status not found in mapping',
          { invoiceId }
        );
      }

      // 解析状态值（格式可能是 "0u8", "1u8" 等）
      const statusStr = String(status).replace(/u8$/i, '').trim();
      const statusNum = parseInt(statusStr, 10);

      if (statusNum < 0 || statusNum > 3) {
        throw new ProtocolServiceError(
          ProtocolError.INVALID_RECORD,
          'Invalid invoice status value',
          { invoiceId, status }
        );
      }

      return statusNum as InvoiceStatus;
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      throw new ProtocolServiceError(
        ProtocolError.MAPPING_NOT_FOUND,
        'Failed to query invoice status mapping',
        { invoiceId, originalError: error }
      );
    }
  }

  /**
   * 广播已生成的零知识证明交易到 Aleo 网络
   * 
   * 使用 AleoNetworkClient.submitTransaction 提交交易
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
   * 等待交易确认
   * 
   * 通过轮询 getTransaction 来检查交易状态
   */
  async waitForTransaction(txId: AleoTransactionId, timeoutMS: number = 60000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 秒轮询一次

    while (Date.now() - startTime < timeoutMS) {
      try {
        const transaction = await this.networkClient.getTransaction(txId);
        
        if (transaction) {
          // 交易已确认
          return transaction;
        }
      } catch (error) {
        // 交易可能还未被节点接收，继续轮询
        console.debug('Transaction not found yet, continuing to poll:', txId);
      }

      // 等待下一次轮询
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // 超时
    throw new ProtocolServiceError(
      ProtocolError.SYNC_TIMEOUT,
      'Transaction confirmation timeout',
      { txId, timeoutMS }
    );
  }

  /**
   * 估算执行费用（Microcredits）
   * 
   * 通过构建 Authorization 并使用 SDK 的 estimateFeeForAuthorization 进行预估
   * 增加 20% 冗余以确保交易能够成功执行
   * 
   * 如果 SDK 预估失败，返回降级方案：250,000 microcredits（0.25 credits）
   */
  async estimateExecutionFee(
    programName: string,
    functionName: string,
    inputs: string[]
  ): Promise<Microcredits> {
    try {
      const programManager = this.getProgramManager();

      // 第一步：构建 Authorization 对象
      // 这个对象包含了交易的完整描述，但还没有生成昂贵的 ZK 证明
      const authorization = await programManager.buildAuthorization({
        programName,
        functionName,
        inputs,
        // 如果程序还没部署或者在本地，可以传入 programSource
        // 但通常不需要，因为 SDK 会从网络获取
      });

      // 第二步：使用 estimateFeeForAuthorization 进行预估
      const baseFeeMicrocredits = await programManager.estimateFeeForAuthorization({
        authorization,
        programName: 'credits.aleo', // 费用支付程序
      });

      // 第三步：转换并增加 20% 冗余
      const fee = BigInt(baseFeeMicrocredits);
      const feeWithBuffer = (fee * 120n) / 100n; // 增加 20% 冗余

      return feeWithBuffer;
    } catch (error: any) {
      console.error('SDK 预估失败:', error);
      
      // 如果是 ProtocolServiceError，直接抛出
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // 降级方案：返回经验硬编码值
      // 250,000 microcredits = 0.25 credits
      // 这是一个保守的估算值，适用于大多数简单的合约调用
      console.warn('使用降级费用估算值: 250,000 microcredits');
      return 250_000n;
    }
  }
}

