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
   * 查询链上程序的 Mapping 值（通用方法）
   * 
   * 可以查询任意程序的任意 Mapping，例如：
   * - credits.aleo 的 account mapping（余额查询）
   * - zk_invoice.aleo 的 invoice_status mapping（发票状态查询）
   * - 任意自定义程序的任意 mapping
   * 
   * @param programId 程序标识符（如: "zk_invoice.aleo"）
   * @param mappingName Mapping 名称（如: "invoice_status"）
   * @param key Mapping 的键值（Field 类型）
   * @returns Mapping 的值（字符串格式），如果不存在则返回 null
   * @throws {ProtocolServiceError} 可能抛出 NODE_CONNECTION_FAILED
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

      // 如果返回 null 或 undefined，表示 Mapping 中不存在该键
      if (value === null || value === undefined) {
        return null;
      }

      // 返回字符串格式的值（可能包含类型后缀，如 "123u64", "0u8" 等）
      return String(value);
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // 网络错误或其他错误
      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to query program mapping value',
        { programId, mappingName, key, originalError: error }
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

  /**
   * 验证生成的 record 是否上链成功
   * 
   * 通过查询交易详情来验证交易是否已确认，并可选择性地验证交易中是否包含预期的 record
   * 
   * 验证逻辑：
   * 1. 查询交易是否存在且已确认
   * 2. 如果提供了 programId，验证交易是否属于该程序
   * 3. 如果提供了 functionName，验证交易调用的函数名称
   * 4. 如果提供了 expectedOutputsCount，验证交易产生的输出 record 数量
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
      // 第一步：查询交易详情
      const transaction = await this.networkClient.getTransaction(transactionId);

      if (!transaction) {
        return {
          verified: false,
          transaction: null,
          message: `Transaction ${transactionId} not found on chain`
        };
      }

      // 第二步：验证交易是否已确认（交易存在即表示已确认）
      // 如果交易被拒绝或失败，通常不会出现在链上，所以这里假设存在即成功

      // 将交易对象转换为 any 类型以便安全访问动态属性
      const tx = transaction as any;

      // 第三步：如果提供了 programId，验证交易是否属于该程序
      if (options?.programId) {
        // 检查交易中的 transitions 是否包含指定的程序
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

      // 第四步：如果提供了 functionName，验证交易调用的函数名称
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

      // 第五步：如果提供了 expectedOutputsCount，验证交易产生的输出 record 数量
      if (options?.expectedOutputsCount !== undefined) {
        // 尝试从交易中提取输出 record 数量
        // 不同版本的交易格式可能不同，需要兼容处理
        let actualOutputsCount = 0;

        // 方法1: 从 execution.outputs 获取
        if (tx.execution?.outputs) {
          actualOutputsCount = tx.execution.outputs.length;
        }
        // 方法2: 从 transitions 的 outputs 获取
        else if (tx.transitions || tx.execution?.transitions) {
          const transitions = tx.transitions || tx.execution.transitions || [];
          actualOutputsCount = transitions.reduce((count: number, transition: any) => {
            const outputs = transition.outputs || [];
            return count + outputs.length;
          }, 0);
        }
        // 方法3: 从 transaction.outputs 获取
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

      // 所有验证通过
      return {
        verified: true,
        transaction,
        message: `Transaction ${transactionId} verified successfully on chain`
      };
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // 如果查询失败，可能是交易不存在或网络错误
      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to verify record on chain',
        { transactionId, originalError: error }
      );
    }
  }
}

