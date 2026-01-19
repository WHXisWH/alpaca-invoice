import { IStorageService, StorageError } from './IStorageService';
import { createServiceError } from '@/lib/service-errors';

const StorageServiceError = createServiceError<StorageError>('StorageService');

const DB_NAME = 'zk_invoice_db';
const DB_VERSION = 3;  // 升级版本号以支持通用存储

/**
 * 序列化数据（处理 bigint 和 Date）
 */
function serializeData<T>(data: T): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'bigint') {
    return { __type: 'BigInt', value: data.toString() };
  }

  if (data instanceof Date) {
    return { __type: 'Date', value: data.getTime() };
  }

  if (Array.isArray(data)) {
    return data.map(item => serializeData(item));
  }

  if (typeof data === 'object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeData(value);
    }
    return serialized;
  }

  return data;
}

/**
 * 反序列化数据（处理 bigint 和 Date）
 */
function deserializeData<T>(data: any): T {
  if (data === null || data === undefined) {
    return data;
  }

  // 检查是否是特殊类型标记
  if (typeof data === 'object' && data.__type) {
    if (data.__type === 'BigInt') {
      return BigInt(data.value) as any;
    }
    if (data.__type === 'Date') {
      return new Date(data.value) as any;
    }
  }

  if (Array.isArray(data)) {
    return data.map(item => deserializeData(item)) as any;
  }

  if (typeof data === 'object') {
    const deserialized: any = {};
    for (const [key, value] of Object.entries(data)) {
      deserialized[key] = deserializeData(value);
    }
    return deserialized;
  }

  return data;
}

/**
 * 通用存储服务实现类
 * 使用 IndexedDB 存储任意类型的数据
 */
export class StorageService implements IStorageService {
  private db: IDBDatabase | null = null;
  private tableNames = new Set<string>(); // 跟踪已创建的表

  /**
   * 初始化数据库连接
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('IndexedDB is not available in server-side environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(
          new StorageServiceError(
            StorageError.READ_FAILED,
            'Failed to open IndexedDB'
          )
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        // 记录已存在的表
        for (let i = 0; i < this.db.objectStoreNames.length; i++) {
          this.tableNames.add(this.db.objectStoreNames[i]);
        }
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // 在升级时，记录所有已存在的表
        for (let i = 0; i < db.objectStoreNames.length; i++) {
          this.tableNames.add(db.objectStoreNames[i]);
        }
      };
    });
  }

  /**
   * 确保表存在（如果不存在则创建）
   * 注意：IndexedDB 只能在 onupgradeneeded 中创建表
   * 这里使用动态版本升级的方式来实现动态表创建
   */
  private async ensureTable(tableName: string): Promise<void> {
    if (this.tableNames.has(tableName)) {
      return;
    }

    const db = await this.getDB();
    
    // 如果表已存在，直接返回
    if (db.objectStoreNames.contains(tableName)) {
      this.tableNames.add(tableName);
      return;
    }

    // 表不存在，需要升级数据库
    return new Promise((resolve, reject) => {
      // 关闭当前连接
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      // 获取当前版本并升级
      const versionRequest = indexedDB.open(DB_NAME);
      versionRequest.onsuccess = () => {
        const currentVersion = versionRequest.result.version;
        versionRequest.result.close();

        // 重新打开并升级
        const upgradeRequest = indexedDB.open(DB_NAME, currentVersion + 1);

        upgradeRequest.onerror = () => {
          reject(
            new StorageServiceError(
              StorageError.WRITE_FAILED,
              `Failed to create table: ${tableName}`
            )
          );
        };

        upgradeRequest.onsuccess = () => {
          this.db = upgradeRequest.result;
          this.tableNames.add(tableName);
          resolve();
        };

        upgradeRequest.onupgradeneeded = (event) => {
          const upgradeDB = (event.target as IDBOpenDBRequest).result;
          if (!upgradeDB.objectStoreNames.contains(tableName)) {
            upgradeDB.createObjectStore(tableName, { keyPath: 'key' });
          }
          // 记录所有表
          for (let i = 0; i < upgradeDB.objectStoreNames.length; i++) {
            this.tableNames.add(upgradeDB.objectStoreNames[i]);
          }
        };
      };

      versionRequest.onerror = () => {
        reject(
          new StorageServiceError(
            StorageError.READ_FAILED,
            'Failed to get database version'
          )
        );
      };
    });
  }

  /**
   * 添加数据到指定表（支持单个或批量）
   */
  async addData<T>(
    tableName: string,
    keyOrList: string | Array<{ key: string; data: T }>,
    data?: T
  ): Promise<void> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);

      // 判断是批量模式还是单个模式
      const isBatch = Array.isArray(keyOrList);
      const items: Array<{ key: string; data: T }> = isBatch
        ? keyOrList
        : [{ key: keyOrList, data: data! }];

      // 批量操作：使用 Promise.all 并行执行
      const promises = items.map((item) => {
        return new Promise<void>((resolve, reject) => {
          // 序列化数据
          const serialized = serializeData(item.data);
          
          const request = store.put({
            key: item.key,
            data: serialized,
            timestamp: Date.now()
          });

          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(
              new StorageServiceError(
                StorageError.WRITE_FAILED,
                `Failed to save data to ${tableName}: ${item.key}`
              )
            );
        });
      });

      await Promise.all(promises);
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to add data: ${(error as Error).message}`
      );
    }
  }

  /**
   * 通过 key 获取数据
   */
  async getData<T>(tableName: string, key: string): Promise<T | undefined> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);

      return new Promise((resolve, reject) => {
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.data) {
            // 反序列化数据
            const deserialized = deserializeData<T>(result.data);
            resolve(deserialized);
          } else {
            resolve(undefined);
          }
        };

        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.READ_FAILED,
              `Failed to read data from ${tableName}: ${key}`
            )
          );
      });
    } catch (error) {
      throw new StorageServiceError(
        StorageError.READ_FAILED,
        `Failed to get data: ${(error as Error).message}`
      );
    }
  }

  /**
   * 获取指定表的所有数据
   */
  async getAllData<T>(tableName: string): Promise<T[]> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          const results = request.result || [];
          // 反序列化所有数据
          const deserialized = results.map((result: any) => 
            deserializeData<T>(result.data)
          );
          resolve(deserialized);
        };

        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.READ_FAILED,
              `Failed to read all data from ${tableName}`
            )
          );
      });
    } catch (error) {
      throw new StorageServiceError(
        StorageError.READ_FAILED,
        `Failed to get all data: ${(error as Error).message}`
      );
    }
  }

  /**
   * 更新部分数据
   */
  async updateData<T>(tableName: string, key: string, updates: Partial<T>): Promise<void> {
    try {
      const existing = await this.getData<T>(tableName, key);
      if (!existing) {
        throw new Error(`Data not found: ${key} in table ${tableName}`);
      }

      // 合并更新
      const updated = { ...existing, ...updates };
      await this.addData(tableName, key, updated);
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to update data: ${(error as Error).message}`
      );
    }
  }

  /**
   * 全量重置表数据
   * @param tableName 表名
   * @param dataList 数据列表，每个数据项必须包含唯一标识字段（key/id/invoiceHash 等）
   */
  async resetAllData<T extends { [key: string]: any }>(tableName: string, dataList: T[]): Promise<void> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);

      // 先清空表
      await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(new Error('Failed to clear table'));
      });

      // 然后批量添加新数据
      // 从数据中提取 key：优先使用 key，然后是 id，然后是 invoiceHash，最后使用索引
      for (const data of dataList) {
        const key = data.key || data.id || data.invoiceHash || String(dataList.indexOf(data));
        await this.addData(tableName, key, data);
      }
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to reset all data: ${(error as Error).message}`
      );
    }
  }

  /**
   * 删除指定数据（支持单个或批量）
   */
  async deleteData(tableName: string, keyOrKeys: string | string[]): Promise<void> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);

      // 判断是批量模式还是单个模式
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];

      // 批量操作：使用 Promise.all 并行执行
      const promises = keys.map((key) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(key);

          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(
              new StorageServiceError(
                StorageError.WRITE_FAILED,
                `Failed to delete data from ${tableName}: ${key}`
              )
            );
        });
      });

      await Promise.all(promises);
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to delete data: ${(error as Error).message}`
      );
    }
  }
}
