import { useEffect, useState } from 'react';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { AleoField } from '@/lib/types';

/**
 * Hook: 加载发票数据
 * 
 * 职责：
 * - 从 Store/IndexedDB 加载发票数据
 * - 获取并管理确认状态（confirmationStatus）
 * - 管理加载状态
 * - ✅ 直接从 store 的 currentInvoice 读取，自动响应更新
 */
export function useInvoiceData(invoiceHash: AleoField | null) {
  const { masterKey } = useUserStore();
  
  // ✅ 直接从 store 订阅 currentInvoice
  const currentInvoice = useNewInvoiceStore((state) => state.currentInvoice);
  const setCurrentInvoice = useNewInvoiceStore((state) => state.setCurrentInvoice);
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!invoiceHash) {
      setCurrentInvoice(null);
      setIsLoading(false);
      return;
    }

    const loadInvoice = async () => {
      setIsLoading(true);
      try {
        // ✅ 使用 store 的 setCurrentInvoice 方法（会自动从内存或 IndexedDB 加载）
        await setCurrentInvoice(invoiceHash, {
          masterKey: masterKey || undefined
        });
      } catch (error) {
        console.error('Failed to load invoice:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInvoice();
  }, [invoiceHash, masterKey, setCurrentInvoice]);

  // ✅ 从 currentInvoice.metadata 获取 confirmationStatus（自动响应更新）
  // updateInvoice 会自动更新 currentInvoice，这里通过 zustand 订阅自动响应
  const confirmationStatus: ChainConfirmationStatus | null = currentInvoice?.metadata?.confirmationStatus || null;

  return { 
    invoice: currentInvoice, 
    isLoading, 
    // ✅ 只返回实际的 confirmationStatus，不做默认假设
    // 让上层根据 sendingInvoiceHashes 决定实际状态
    confirmationStatus: currentInvoice ? confirmationStatus : null
  };
}

