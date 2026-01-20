/** * Storage 异常枚举 */
export enum StorageError {
  WRITE_FAILED = 'WRITE_FAILED',   // 磁盘满或存储权限被拒绝
  READ_FAILED = 'READ_FAILED',     // 数据损坏或索引不存在
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED' // 存储配额超出限制
}

/**
 * 通用存储服务接口
 * 支持任意类型的数据存储，通过 tableName 区分不同的数据表
 */
export interface IStorageService {
  /**
   * 添加数据到指定表（单个或批量）
   * @param tableName 表名（用于区分不同的数据表，如 'invoices', 'settings' 等）
   * @param keyOrList 单个 key 或数据项列表（包含 key 和 data）
   * @param data 要存储的数据对象（单个模式时使用）
   */
  addData<T>(tableName: string, key: string, data: T): Promise<void>;
  addData<T>(tableName: string, dataList: Array<{ key: string; data: T }>): Promise<void>;
  
  /**
   * 通过 key 获取数据
   * @param tableName 表名
   * @param key 数据的唯一标识键
   * @returns 数据对象，如果不存在则返回 undefined
   */
  getData<T>(tableName: string, key: string): Promise<T | undefined>;
  
  /**
   * 获取指定表的所有数据
   * @param tableName 表名
   * @returns 数据对象数组
   */
  getAllData<T>(tableName: string): Promise<T[]>;
  
  /**
   * 更新部分数据
   * @param tableName 表名
   * @param key 数据的唯一标识键
   * @param updates 要更新的部分数据（Partial<T>）
   */
  updateData<T>(tableName: string, key: string, updates: Partial<T>): Promise<void>;
  
  /**
   * 全量重置表数据（例如同步链上数据后）
   * @param tableName 表名
   * @param dataList 要重置的数据列表，每个数据项必须包含唯一标识字段（key/id/invoiceHash 等）
   */
  resetAllData<T extends { [key: string]: any }>(tableName: string, dataList: T[]): Promise<void>;
  
  /**
   * 删除指定数据（单个或批量）
   * @param tableName 表名
   * @param keyOrKeys 单个 key 或 key 数组
   */
  deleteData(tableName: string, key: string): Promise<void>;
  deleteData(tableName: string, keys: string[]): Promise<void>;
}
