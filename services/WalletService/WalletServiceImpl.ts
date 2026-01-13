import { AleoAddress, Microcredits } from '@/lib/types';
import { IWalletService, WalletServiceError, WalletError } from './IWalletService';

/**
 * WalletService 实现类
 * 
 * 职责：封装钱包操作，提供业务层接口
 * 
 * 优势：
 * - 不使用复杂的 Adapter 模式
 * - 直接接收 wallet 实例（来自 useWallet）
 * - 可以管理内部状态（如事件监听器）
 * - 保持面向对象的架构风格
 * 
 * 使用方式：
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
   * 连接钱包
   * @throws {WalletServiceError} 可能抛出 NOT_INSTALLED, USER_REJECTED, NETWORK_MISMATCH
   */
  async connect(): Promise<void> {
    // 检查钱包是否安装
    if (!this.wallet) {
      console.error('❌ [WalletService] 钱包实例不存在');
      throw new WalletServiceError(
        WalletError.NOT_INSTALLED,
        'Aleo wallet extension not detected. Please install Leo Wallet.',
        { hint: 'Visit https://leo.app to download' }
      );
    }

    console.log('🔍 [WalletService] 开始连接钱包', {
      hasConnectMethod: typeof this.wallet.connect === 'function'
    });

    try {
      await this.wallet.connect();
      console.log('✅ [WalletService] this.wallet.connect() Promise resolved');
    } catch (error: any) {
      // 已经是 WalletServiceError，直接抛出
      if (error instanceof WalletServiceError) {
        console.log('🔍 [WalletService] 捕获到 WalletServiceError，直接抛出:', {
          code: error.code,
          message: error.message,
          details: error.details
        });
        throw error;
      }

      // 🔍 记录原始错误的详细信息
      console.error('❌ [WalletService] 捕获到未知错误，开始分析:', {
        error,
        errorType: error?.constructor?.name,
        message: error?.message,
        code: error?.code,
        errorCode: error?.error?.code,
        name: error?.name,
        stack: error?.stack,
        stringified: String(error)
      });

      // 改进的用户拒绝检测（更全面的场景）
      const errorMessage = error?.message?.toLowerCase() || '';
      const errorString = String(error).toLowerCase();
      const errorCode = error?.code || error?.error?.code;
      
      // 更全面的用户拒绝场景检测
      if (
        errorMessage.includes('reject') ||
        errorMessage.includes('denied') ||
        errorMessage.includes('cancel') ||
        errorMessage.includes('user cancelled') ||
        errorString.includes('reject') ||
        errorString.includes('denied') ||
        errorString.includes('cancel') ||
        errorCode === 4001 || // EIP-1193 拒绝代码
        errorCode === 'ACTION_REJECTED' ||
        errorCode === 'USER_REJECTED'
      ) {
        console.log('🔍 [WalletService] 识别为用户拒绝');
        throw new WalletServiceError(
          WalletError.USER_REJECTED,
          'User rejected the connection request',
          { originalError: error.message || error }
        );
      }

      // 网络不匹配
      if (error?.message?.includes('network')) {
        console.log('🔍 [WalletService] 识别为网络不匹配');
        throw new WalletServiceError(
          WalletError.NETWORK_MISMATCH,
          'Wallet network does not match required network',
          { originalError: error.message }
        );
      }

      // 未知错误 - 但提供更详细的错误信息
      console.error('❌ [WalletService] 无法识别错误类型，归类为 UNAUTHORIZED');
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
   * 断开钱包连接
   */
  async disconnect(): Promise<void> {
    try {
      await this.wallet.disconnect();
    } catch (error: any) {
      // 断开连接失败通常不是致命错误，只记录日志
      console.warn('Failed to disconnect wallet:', error);
    }
  }

  /**
   * 获取私有余额（从钱包 Records 计算）
   * @param publicKey 钱包公钥地址
   * @returns 私有余额（Microcredits）
   * @throws {WalletServiceError} 可能抛出 UNAUTHORIZED, DECRYPTION_FAILED
   * 
   * 说明：
   * 不需要自己管理 ViewKey，钱包适配器的 requestRecords 会自动利用钱包内部的 ViewKey
   * 解密属于当前用户的 credits Record。
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

      // 请求 credits.aleo 的 Records
      const creditsResponse = await requestRecords('credits.aleo');
      const records = creditsResponse?.records || [];

      // 计算私有余额
      let privateBalance = 0n;
      for (const record of records) {
        if (!record.spent && record.data?.microcredits) {
          const amount = BigInt(record.data.microcredits);
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
   * 获取手续费 Records
   * @param amount 所需最小金额
   * @param publicKey 钱包公钥地址
   * @returns 符合条件的 Record 字符串列表
   * @throws 余额不足等错误
   * 
   * 策略：
   * 1. 策略1：最小满足法 - 找一个面值刚好大于等于手续费且最小的 Record
   * 2. 策略2：多张合并法 - 找到刚好满足或最接近所需金额的组合（减少找零）
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

      // 筛选未花费且金额大于0的 Records 并转换为带金额的对象
      const unspentRecords = records
        .filter((r: any) => !r.spent)
        .map((r: any) => ({
          record: r,
          amount: BigInt(r.data?.microcredits || 0),
          recordString: typeof r === 'string' ? r : JSON.stringify(r)
        }))
        .filter((r: any) => r.amount > 0n); // 过滤掉金额为0的records

      if (unspentRecords.length === 0) {
        throw new WalletServiceError(
          WalletError.INSUFFICIENT_FEE,
          'No unspent fee records available',
          { requiredAmount: amount.toString() }
        );
      }

      // 策略1：最小满足法 - 找一个面值刚好大于等于手续费且最小的 Record
      const suitableRecords = unspentRecords.filter(r => r.amount >= amount);
      if (suitableRecords.length > 0) {
        // 找到最小的满足条件的 Record
        const minRecord = suitableRecords.reduce((min, current) => 
          current.amount < min.amount ? current : min
        );
        return [minRecord.recordString];
      }

      // 策略2：多张合并法 - 寻找最优组合（总和最接近所需金额）
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
      // 已经是 WalletServiceError，直接抛出
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
   * 寻找最优的 Records 组合
   * 使用动态规划找到总和 >= amount 且最接近 amount 的组合
   */
  private findBestRecordCombination(
    records: Array<{ record: any; amount: bigint; recordString: string }>,
    targetAmount: bigint
  ): Array<{ record: any; amount: bigint; recordString: string }> {
    let bestCombination: typeof records = [];
    let bestSum = BigInt(0);
    let minExcess = BigInt(Number.MAX_SAFE_INTEGER);

    // 尝试所有可能的组合（使用位掩码）
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

      // 如果这个组合满足条件（总和 >= 目标金额）
      if (sum >= targetAmount) {
        const excess = sum - targetAmount;
        
        // 如果这是第一个满足的组合，或者找零更少，或者找零相同但使用的Records更少
        if (
          bestCombination.length === 0 ||
          excess < minExcess ||
          (excess === minExcess && combination.length < bestCombination.length)
        ) {
          bestCombination = combination;
          bestSum = sum;
          minExcess = excess;
          
          // 如果刚好满足（不需要找零），直接返回
          if (excess === BigInt(0)) {
            break;
          }
        }
      }
    }

    return bestCombination;
  }

  /**
   * 签名消息（用于身份校验或审计授权）
   * @param message 要签名的消息
   * @param publicKey 钱包公钥地址
   * @returns 签名字符串
   * @throws {WalletServiceError} 可能抛出 UNAUTHORIZED, USER_REJECTED
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
      // 已经是 WalletServiceError，直接抛出
      if (error instanceof WalletServiceError) {
        throw error;
      }

      // 用户拒绝
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
}
