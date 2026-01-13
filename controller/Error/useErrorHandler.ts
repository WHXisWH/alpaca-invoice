import { useCallback } from 'react';
import { useErrorStore } from '@/stores/Error/useErrorStore';
import { toAppError } from '@/lib/errors';

/**
 * 错误处理 Controller
 * 
 * 职责：
 * 1. 提供统一的错误处理接口
 * 2. 将原始错误转换为用户友好的提示
 * 3. 更新 ErrorStore
 */
export function useErrorHandler() {
  const { showError } = useErrorStore();

  /**
   * 处理错误
   * 自动将任何错误转换为 AppError 并显示
   */
  const handleError = useCallback((error: any) => {
    const appError = toAppError(error);
    
    // 记录到控制台（开发时便于调试）
    console.error('❌ Error caught:', {
      type: appError.type,
      title: appError.title,
      description: appError.description,
      original: appError.originalError
    });

    // 更新 Store，触发 Toast 显示
    showError(appError.title, appError.description);
  }, [showError]);

  return {
    handleError
  };
}

