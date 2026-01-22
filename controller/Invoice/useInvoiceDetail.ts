import { useMemo } from 'react';
import { useInvoiceData } from './useInvoiceData';
import { useInvoiceRole } from './useInvoiceRole';
import { useInvoiceChainSync } from './useInvoiceChainSync';
import { useInvoiceActions } from './useInvoiceActions';
import { getStatusConfig } from '@/lib/invoice';
import { IInvoiceDetail } from './IInvoiceDetail';
import { AleoField, InvoiceStatus } from '@/lib/types';

/**
 * useInvoiceDetail Hook
 * 实现场景B & C：查看详情与Record自动对账
 * 
 * 流程：
 * 1. 从URL获取hash
 * 2. 从Store获取发票（可能状态是'SENDING'）
 * 3. 如果状态不是'CONFIRMED'，开始轮询扫描Record
 * 4. 每15秒扫描一次，查找匹配的Record
 * 5. 如果找到匹配的Record，更新状态为'CONFIRMED'并同步到IndexedDB
 * 6. 停止轮询
 * 
 * 架构：
 * 本 Hook 作为组合器，将以下子 hooks 组合在一起：
 * - useInvoiceData: 发票数据加载
 * - useInvoiceRole: 用户角色判断
 * - useInvoiceChainSync: 链上同步逻辑
 * - useInvoiceActions: 支付/取消操作
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
  
  // 4. 链上同步（updateInvoice 会自动更新 currentInvoice，useInvoiceData 会通过 zustand 订阅自动响应）
  const {
    isSyncing,
    isSyncingStatus,
    handleSyncStatus,
    startPolling,
    stopPolling
  } = useInvoiceChainSync(
    invoice, 
    invoiceHash, 
    confirmationStatus
  );
  
  // 5. 操作（支付/取消后触发同步）
  const {
    isProcessing,
    handlePay,
    handleCancel
  } = useInvoiceActions(invoice, handleSyncStatus);

  return {
    invoice,
    isLoadingInvoice,
    currentStatus: confirmationStatus,
    isSyncing,
    isConfirmed: confirmationStatus === 'CONFIRMED',
    userRole,
    statusConfig,
    isProcessing,
    isSyncingStatus,
    handlePay,
    handleCancel,
    handleSyncStatus,
    startPolling,
    stopPolling
  };
}
