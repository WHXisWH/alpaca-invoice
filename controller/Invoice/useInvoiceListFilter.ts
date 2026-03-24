import { useMemo, useState } from 'react';
import { InvoiceStatus } from '@/lib/types';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { Invoice } from '@/lib/types';
import { StatusConfig } from './IInvoices';

type InvoiceWithRole = {
  invoice: Invoice;
  role: 'SELLER' | 'BUYER' | 'BOTH';
  chainStatus: ChainConfirmationStatus;
  statusConfig: StatusConfig;
};

/**
 * Hook: 列表页过滤和搜索逻辑
 * 
 * 职责：
 * - 管理过滤状态（all/pending/paid/cancelled）
 * - 管理搜索关键词
 * - 提供过滤后的发票列表
 */
export function useInvoiceListFilter(
  invoicesWithRole: InvoiceWithRole[]
) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled' | 'escrowed'>('all');
  const [search, setSearch] = useState('');

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
              : filter === 'escrowed'
                ? invoice.status === InvoiceStatus.ESCROWED
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

  return {
    filteredInvoices,
    filter,
    search,
    setFilter,
    setSearch
  };
}

