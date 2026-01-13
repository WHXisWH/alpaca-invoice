'use client';

import { useEffect } from 'react';
import { useErrorStore } from '@/stores/Error/useErrorStore';
import { toast } from 'sonner';

/**
 * 全局错误处理组件
 * 
 * 职责：
 * 1. 监听 ErrorStore 中的错误状态
 * 2. 自动使用 toast 组件展示错误
 * 3. 符合架构原则：作为 View 层组件，从 Store 读取状态
 */
export function ErrorHandler() {
  const { currentError, clearError } = useErrorStore();

  useEffect(() => {
    if (currentError) {
      // 使用 sonner toast 显示错误
      toast.error(currentError.title, {
        description: currentError.description,
        duration: 5000,
        action: {
          label: '关闭',
          onClick: () => clearError()
        }
      });

      // 自动清除错误（避免重复显示）
      const timer = setTimeout(() => {
        clearError();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [currentError, clearError]);

  // 这个组件不渲染任何 UI，仅负责错误处理逻辑
  return null;
}

