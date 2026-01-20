import { useMemo } from 'react';
import { useUserStore } from '@/stores/User/useUserStore';
import { Invoice, AleoField } from '@/lib/types';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import { getStatusConfig, determineInvoiceRole } from '@/lib/invoice';

/**
 * Hook: 发票角色判断逻辑（可复用）
 * 
 * 职责：
 * - 根据用户地址判断发票角色（SELLER/BUYER/BOTH）
 * - 添加链上确认状态和状态配置
 * - 可被详情页和列表页复用
 */
export function useInvoiceListRole(
  invoices: Invoice[],
  chainStatusMap: Map<AleoField, ChainConfirmationStatus>
) {
  const { publicKey } = useUserStore();

  /**
   * 根据当前用户地址判断发票角色（SELLER/BUYER/BOTH）
   * ✅ 添加链上确认状态和状态配置
   */
  const invoicesWithRole = useMemo(() => {
    if (!publicKey) return [];
    
    return invoices.map((invoice) => {
      // ✅ 使用公共函数判断角色
      const role = determineInvoiceRole(publicKey, invoice);
      
      // 转换为列表页格式
      const listRole: 'SELLER' | 'BUYER' | 'BOTH' = 
        role === 'both' ? 'BOTH' :
        role === 'seller' ? 'SELLER' :
        role === 'buyer' ? 'BUYER' : 'SELLER';
      
      // ✅ 从本地状态映射获取链上确认状态
      const chainStatus: ChainConfirmationStatus = chainStatusMap.get(invoice.invoiceHash) || 'SENDING';
      
      return { 
        invoice, 
        role: listRole,
        chainStatus,
        statusConfig: getStatusConfig(invoice.status)
      };
    });
  }, [invoices, publicKey, chainStatusMap]);

  return {
    invoicesWithRole
  };
}

