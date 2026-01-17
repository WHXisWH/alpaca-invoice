import { useMemo, useState, useCallback } from 'react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceInitialize } from './useInvoiceInitialize';
import { InvoiceStatus, type Invoice } from '@/lib/types';
import { IInvoices } from './IInvoices';

/**
 * useInvoices Hook
 * 发票列表页的业务逻辑控制器
 * 
 * 职责：
 * 1. 管理初始化状态（通过 useInvoiceInitialize）
 * 2. 管理过滤和搜索状态
 * 3. 根据当前用户地址判断发票角色
 * 4. 提供过滤后的发票列表
 */
export function useInvoices(): IInvoices {
  // 使用初始化 hook
  const { initialize, handleUnlock, isAuthRequired, isLoading, isReady } = useInvoiceInitialize();
  
  // 从 Store 获取数据
  const { invoices } = useInvoiceStore();
  const { publicKey } = useUserStore();
  
  // 本地状态：过滤和搜索
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');
  const [search, setSearch] = useState('');

  /**
   * 根据当前用户地址判断发票角色（SELLER/BUYER/BOTH）
   */
  const invoicesWithRole = useMemo(() => {
    if (!publicKey) return [];
    
    return invoices.map((invoice) => {
      const isSeller = invoice.seller === publicKey;
      const isBuyer = invoice.buyer === publicKey;
      
      let role: 'SELLER' | 'BUYER' | 'BOTH' = 'SELLER';
      if (isSeller && isBuyer) {
        role = 'BOTH';
      } else if (isBuyer) {
        role = 'BUYER';
      } else if (isSeller) {
        role = 'SELLER';
      }
      
      return { invoice, role };
    });
  }, [invoices, publicKey]);

  /**
   * 前端过滤和搜索（基于 Store 数据）
   */
  const filteredInvoices = useMemo(() => {
    return invoicesWithRole.filter(({ invoice }) => {
      // 状态过滤
      const matchStatus =
        filter === 'all'
          ? true
          : filter === 'pending'
            ? invoice.status === InvoiceStatus.PENDING
            : filter === 'paid'
              ? invoice.status === InvoiceStatus.PAID
              : invoice.status === InvoiceStatus.CANCELLED;
      
      // 搜索过滤
      const searchLower = search.trim().toLowerCase();
      const matchSearch =
        searchLower === '' ||
        invoice.id.toLowerCase().includes(searchLower) ||
        invoice.invoiceHash.toLowerCase().includes(searchLower) ||
        invoice.buyer.toLowerCase().includes(searchLower) ||
        invoice.seller.toLowerCase().includes(searchLower);
      
      return matchStatus && matchSearch;
    });
  }, [invoicesWithRole, filter, search]);

  /**
   * 刷新发票列表
   */
  const refresh = useCallback(async () => {
    await initialize();
  }, [initialize]);

  /**
   * 业务逻辑判断：是否显示授权遮罩
   */
  const showAuthModal = useMemo(() => {
    return isAuthRequired;
  }, [isAuthRequired]);

  /**
   * 业务逻辑判断：是否显示加载状态
   */
  const showLoading = useMemo(() => {
    return isLoading;
  }, [isLoading]);

  /**
   * 业务逻辑判断：是否显示钱包连接提示
   */
  const showWalletPrompt = useMemo(() => {
    return !isReady && !isAuthRequired;
  }, [isReady, isAuthRequired]);

  /**
   * 业务逻辑判断：是否显示主内容
   */
  const showMainContent = useMemo(() => {
    return isReady && !isAuthRequired && !isLoading;
  }, [isReady, isAuthRequired, isLoading]);

  return {
    filteredInvoices,
    filter,
    search,
    isAuthRequired,
    isLoading,
    isReady,
    showAuthModal,
    showLoading,
    showWalletPrompt,
    showMainContent,
    setFilter,
    setSearch,
    handleUnlock,
    refresh
  };
}

