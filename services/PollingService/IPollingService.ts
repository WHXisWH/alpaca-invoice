/**
 * 通用轮询服务接口
 * 职责：管理任意类型的轮询任务
 * 
 * 使用场景：
 * - 发票状态轮询
 * - 交易确认轮询
 * - 余额更新轮询
 * - 其他需要定期检查的场景
 */
export interface ValidationResult {
  /** 是否应该停止轮询并确认 */
  shouldStop: boolean;
  /** 原因说明（用于日志和用户提示） */
  reason: string;
  /** 是否应该继续轮询（即使不符合预期） */
  shouldContinue?: boolean;
}

export interface PollingConfig<TScanResult = any> {
  /** 轮询间隔（毫秒） */
  pollInterval: number;
  /** 轮询超时时间（毫秒） */
  pollTimeout: number;
  /** 轮询任务名称（用于日志） */
  taskName?: string;
}

export interface PollingCallbacks<TScanResult> {
  /**
   * 执行扫描操作
   * @returns 扫描结果
   */
  scan: () => Promise<TScanResult>;
  
  /**
   * 验证扫描结果是否符合预期
   * @param result 扫描结果
   * @returns 验证结果，包含是否应该停止轮询
   */
  validate: (result: TScanResult) => ValidationResult;
  
  /**
   * 当找到符合预期的结果时调用
   * @param result 扫描结果
   */
  onSuccess: (result: TScanResult) => Promise<void>;
  
  /**
   * 当轮询超时时调用
   */
  onTimeout: () => Promise<void>;
  
  /**
   * 当扫描失败时调用（可选，默认继续轮询）
   * @param error 错误对象
   */
  onError?: (error: Error) => void;
}

export interface IPollingService {
  /**
   * 开始轮询
   */
  start(): void;
  
  /**
   * 停止轮询
   */
  stop(): void;
  
  /**
   * 检查是否正在运行
   */
  isRunning(): boolean;
  
  /**
   * 获取轮询状态
   */
  getStatus(): {
    isRunning: boolean;
    startTime: number | null;
    elapsedTime: number | null;
  };
}

