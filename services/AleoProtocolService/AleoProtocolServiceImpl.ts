import {
  AleoAddress,
  AleoField,
  AleoTransactionId,
  InvoiceStatus,
  Microcredits
} from '@/lib/types';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { IAleoProtocolService, ProtocolServiceError, ProtocolError } from './IAleoProtocolService';
import { getChainIdFromNetwork } from '@/lib/network';

/**
 * AleoProtocolService 实现类
 * 
 * 职责：与 Aleo 区块链节点交互，查询链上数据和广播交易
 */
export class AleoProtocolService implements IAleoProtocolService {
  private rpcUrl: string;
  private chainId: string;

  constructor(network: WalletAdapterNetwork = WalletAdapterNetwork.TestnetBeta) {
    this.chainId = getChainIdFromNetwork(network);
    this.rpcUrl = this.getRpcUrlForNetwork(network);
  }

  /**
   * 根据网络类型获取 RPC URL
   */
  private getRpcUrlForNetwork(network: WalletAdapterNetwork): string {
    switch (network) {
      case WalletAdapterNetwork.MainnetBeta:
        return 'https://api.explorer.provable.com/v2/mainnet';
      case WalletAdapterNetwork.Testnet:
      case WalletAdapterNetwork.TestnetBeta:
        return 'https://api.explorer.provable.com/v2/testnet';
      default:
        return 'https://api.explorer.provable.com/v2/testnet';
    }
  }

  /**
   * 获取当前链的最新区块高度
   */
  async getLatestBlockHeight(): Promise<number> {
    try {
      const response = await fetch(`${this.rpcUrl}/${this.chainId}/latest/height`);
      
      if (!response.ok) {
        throw new ProtocolServiceError(
          ProtocolError.NODE_CONNECTION_FAILED,
          'Failed to fetch latest block height',
          { status: response.status, statusText: response.statusText }
        );
      }

      const height = await response.json();
      return Number(height);
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }
      
      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to connect to Aleo node',
        { rpcUrl: this.rpcUrl, originalError: error }
      );
    }
  }

  /**
   * 获取公开余额（从链上 Mapping 查询）
   * 查询 credits.aleo 程序的 account mapping
   */
  async getPublicBalance(address: AleoAddress): Promise<Microcredits> {
    try {
      // 查询 credits.aleo 程序的 account mapping
      const response = await fetch(
        `${this.rpcUrl}/program/credits.aleo/mapping/account/${address}`,
        {
          method: 'get',
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      // 如果地址没有公开余额，API 会返回 404
      if (response.status === 404) {
        return 0n;
      }

      if (!response.ok) {
        // 对于非 404 错误，返回 0 并打印警告（而不是抛出异常）
        console.warn('Failed to get public balance, returning 0:', {
          status: response.status,
          statusText: response.statusText,
          address
        });
        return 0n;
      }

      const data = await response.text();
            
      // 移除可能的单位后缀（如 "u64"）并解析为 bigint
      // 先去除引号和空白字符，然后移除 u64 后缀
      const balanceStr = data
        .trim()
        .replace(/^["']|["']$/g, '') // 移除首尾引号
        .replace(/u64$/i, '') // 移除 u64 后缀（不区分大小写）
        .trim();
      return BigInt(balanceStr || 0);
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }
      
      // 网络错误
      if (error.message?.includes('fetch')) {
        throw new ProtocolServiceError(
          ProtocolError.NODE_CONNECTION_FAILED,
          'Failed to connect to Aleo node',
          { rpcUrl: this.rpcUrl, originalError: error }
        );
      }
      
      // 其他错误返回 0（可能是地址没有公开余额）
      console.warn('Failed to get public balance, returning 0:', error);
      return 0n;
    }
  }

  /**
   * 获取指定地址在特定程序下的所有加密Record
   */
  async fetchRawRecords(
    programId: string,
    address: AleoAddress,
    startHeight: number
  ): Promise<string[]> {
    // TODO: 实现 Records 查询
    throw new Error('Not implemented yet');
  }

  /**
   * 查询链上发票状态Mapping
   */
  async getInvoiceMappingStatus(invoiceId: AleoField): Promise<InvoiceStatus> {
    // TODO: 实现 Mapping 查询
    throw new Error('Not implemented yet');
  }

  /**
   * 广播已生成的零知识证明交易到 Aleo 网络
   */
  async broadcastTransaction(transactionPayload: any): Promise<AleoTransactionId> {
    // TODO: 实现交易广播
    throw new Error('Not implemented yet');
  }

  /**
   * 等待交易确认
   */
  async waitForTransaction(txId: AleoTransactionId, timeoutMS?: number): Promise<any> {
    // TODO: 实现交易等待
    throw new Error('Not implemented yet');
  }
}

