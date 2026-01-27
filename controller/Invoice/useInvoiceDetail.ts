import { useMemo } from 'react';
import { useInvoiceData } from './useInvoiceData';
import { useInvoiceRole } from './useInvoiceRole';
import { useInvoiceChainSync } from './useInvoiceChainSync';
import { useInvoiceActions } from './useInvoiceActions';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { getStatusConfig } from '@/lib/invoice';
import { IInvoiceDetail } from './IInvoiceDetail';
import { AleoField, InvoiceStatus } from '@/lib/types';

/**
 * useInvoiceDetail Hook
 * 实现场景B & C：查看详情与Record自动对账
 * 
 * ✅ 统一轮询架构：
 * - 自动轮询：由全局 AutoPoller 统一管理（监听 sendingInvoiceHashes）
 * - 手动同步：由 useInvoiceChainSync 提供（handleSyncStatus）
 * - 状态显示：从 sendingInvoiceHashes 派生 isSyncing
 * 
 * 架构：
 * 本 Hook 作为组合器，将以下子 hooks 组合在一起：
 * - useInvoiceData: 发票数据加载
 * - useInvoiceRole: 用户角色判断
 * - useInvoiceChainSync: 手动同步逻辑
 * - useInvoiceActions: 支付/取消操作
 * - useInvoiceStore: 订阅全局 SENDING 状态
 */
export function useInvoiceDetail(invoiceHash: AleoField | null): IInvoiceDetail {
  // 1. 数据加载
  const { 
    invoice, 
    isLoading: isLoadingInvoice, 
    confirmationStatus
  } = useInvoiceData(invoiceHash);
  
  // 2. 用户角色
  const userRole = useInvoiceRole(invoice);
  
  // 3. 状态配置
  const statusConfig = useMemo(() => {
    return invoice ? getStatusConfig(invoice.status) : getStatusConfig(InvoiceStatus.PENDING);
  }, [invoice]);
  
  // ✅ 4. 从 store 订阅全局 SENDING 状态（派生 isSyncing）
  const sendingInvoiceHashes = useInvoiceStore((state) => state.sendingInvoiceHashes);
  const isSyncing = useMemo(() => {
    return invoiceHash ? sendingInvoiceHashes[invoiceHash] === true : false;
  }, [invoiceHash, sendingInvoiceHashes]);
  
  // 5. 手动同步逻辑（不再自动轮询，只提供手动同步功能）
  const {
    isSyncingStatus,
    handleSyncStatus
  } = useInvoiceChainSync(
    invoice, 
    invoiceHash, 
    confirmationStatus
  );
  
  // 6. 操作（支付/取消后自动标记为 SENDING，由 AutoPoller 处理轮询）
  const {
    isProcessing,
    handlePay,
    handleCancel
  } = useInvoiceActions(invoice);

  return {
    invoice,
    isLoadingInvoice,
    currentStatus: confirmationStatus,
    isSyncing,  // ✅ 派生自全局 sendingInvoiceHashes
    // ✅ isConfirmed: 只有 confirmationStatus === 'CONFIRMED' 时才为 true
    // - null: 发票刚创建，还未确认 → false（阻止操作）
    // - 'SENDING': 正在确认中 → false（阻止操作）
    // - 'CONFIRMED': 已确认 → true（允许操作）
    isConfirmed: confirmationStatus === 'CONFIRMED',
    userRole,
    statusConfig,
    isProcessing,
    isSyncingStatus,
    handlePay,
    handleCancel,
    handleSyncStatus
  };
}
