import { useCallback, useState } from 'react';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { Invoice, AleoField } from '@/lib/types';
import { toast } from 'sonner';

/**
 * Hook: 发票操作（支付/取消）
 * 
 * 使用方式：
 * - useInvoiceActions(invoice, onSync) - handlePay() 和 handleCancel() 直接使用传入的 invoice
 * 
 * 职责：
 * - 处理支付操作
 * - 处理取消操作
 * - 管理操作状态
 * - ✅ 操作成功后标记为 SENDING（触发 AutoPoller）
 */
export function useInvoiceActions(
  invoice: Invoice | null,
  onSyncAfterAction?: () => Promise<void>
) {
  const { executePay, executeCancel } = useTransactionController();
  const { handleError } = useErrorHandler();
  const markInvoiceSending = useInvoiceStore((state) => state.markInvoiceSending);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * 处理支付
   * 直接使用 hook 的 invoice 对象，不需要参数
   * ✅ 成功后标记为 SENDING，触发全局 AutoPoller
   */
  const handlePay = useCallback(async () => {
    if (!invoice) {
      toast.error('Payment failed', {
        description: 'Invoice data not available. Please try again.'
      });
      return;
    }
    
    setIsProcessing(true);
    try {
      toast.loading('Processing payment...', { id: `pay-${invoice.id}` });
      const transactionId = await executePay(invoice);
      
      // ✅ 标记为 SENDING（触发 AutoPoller 自动轮询）
      markInvoiceSending(invoice.invoiceHash);
      
      toast.success('Payment successful!', {
        id: `pay-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      
      // 不再需要手动同步，AutoPoller 会自动处理
    } catch (error) {
      toast.error('Payment failed', {
        id: `pay-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [invoice, executePay, markInvoiceSending, handleError]);

  /**
   * 处理取消
   * 直接使用 hook 的 invoice 对象，不需要参数
   * ✅ 成功后标记为 SENDING，触发全局 AutoPoller
   */
  const handleCancel = useCallback(async () => {
    if (!invoice) {
      toast.error('Cancellation failed', {
        description: 'Invoice data not available. Please try again.'
      });
      return;
    }
    
    setIsProcessing(true);
    try {
      toast.loading('Cancelling invoice...', { id: `cancel-${invoice.id}` });
      const transactionId = await executeCancel(invoice);
      
      // ✅ 标记为 SENDING（触发 AutoPoller 自动轮询）
      markInvoiceSending(invoice.invoiceHash);
      
      toast.success('Invoice cancelled successfully', { 
        id: `cancel-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      
      // 不再需要手动同步，AutoPoller 会自动处理
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: `cancel-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [invoice, executeCancel, markInvoiceSending, handleError]);

  return {
    isProcessing,
    handlePay,
    handleCancel
  };
}

