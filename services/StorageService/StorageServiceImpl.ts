import { AleoField, EncryptedPayload } from '@/lib/types';
import { IStorageService, StorageError } from './IStorageService';
import { createServiceError } from '@/lib/service-errors';

const StorageServiceError = createServiceError<StorageError>('StorageService');

const DB_NAME = 'zk_invoice_db';
const DB_VERSION = 1;
const STORE_NAME = 'encrypted_invoices';
const SYNC_STORE = 'sync_metadata';

/**
 * StorageService 实现类
 * 使用 IndexedDB 存储加密后的发票明细
 */
export class StorageService implements IStorageService {
  private db: IDBDatabase | null = null;

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
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建发票存储
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'invoiceHash' });
        }

        // 创建同步元数据存储
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          db.createObjectStore(SYNC_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * 存储加密后的发票明细
   */
  async saveEncryptedInvoice(
    invoiceHash: AleoField,
    payload: EncryptedPayload
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.put({
          invoiceHash,
          ...payload,
          timestamp: Date.now()
        });

        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.WRITE_FAILED,
              `Failed to save invoice: ${invoiceHash}`
            )
          );
      });
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to save encrypted invoice: ${(error as Error).message}`
      );
    }
  }

  /**
   * 读取加密后的发票明细
   */
  async getEncryptedInvoice(invoiceHash: AleoField): Promise<EncryptedPayload | null> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(invoiceHash);

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            resolve({
              iv: result.iv,
              ciphertext: result.ciphertext
            });
          } else {
            resolve(null);
          }
        };

        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.READ_FAILED,
              `Failed to read invoice: ${invoiceHash}`
            )
          );
      });
    } catch (error) {
      throw new StorageServiceError(
        StorageError.READ_FAILED,
        `Failed to get encrypted invoice: ${(error as Error).message}`
      );
    }
  }

  /**
   * 删除本地缓存
   */
  async deleteInvoice(invoiceHash: AleoField): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.delete(invoiceHash);

        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.WRITE_FAILED,
              `Failed to delete invoice: ${invoiceHash}`
            )
          );
      });
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to delete invoice: ${(error as Error).message}`
      );
    }
  }

  /**
   * 存储同步高度
   */
  async setLastSyncHeight(height: number): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([SYNC_STORE], 'readwrite');
      const store = transaction.objectStore(SYNC_STORE);

      return new Promise((resolve, reject) => {
        const request = store.put({
          key: 'lastSyncHeight',
          value: height
        });

        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.WRITE_FAILED,
              'Failed to save sync height'
            )
          );
      });
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to set sync height: ${(error as Error).message}`
      );
    }
  }

  /**
   * 获取同步高度
   */
  async getLastSyncHeight(): Promise<number> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([SYNC_STORE], 'readonly');
      const store = transaction.objectStore(SYNC_STORE);

      return new Promise((resolve, reject) => {
        const request = store.get('lastSyncHeight');

        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? result.value : 0);
        };

        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.READ_FAILED,
              'Failed to read sync height'
            )
          );
      });
    } catch (error) {
      // 如果读取失败，返回 0
      return 0;
    }
  }
}

