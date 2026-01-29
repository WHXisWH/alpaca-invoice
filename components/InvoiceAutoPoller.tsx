'use client';

import { useEffect, useRef } from 'react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useInvoiceListPolling } from '@/controller/Invoice/useInvoiceListPolling';
import { AleoField, Invoice } from '@/lib/types';

/**
 * InvoiceAutoPoller 全局自动轮询组件
 * 
 * 职责：
 * - 监听 store 的 sendingInvoiceHashes
 * - 当发现新的 SENDING 发票时，自动启动轮询
 * - 轮询完成后，自动更新 store（移除 SENDING 状态）
 * 
 * 特点：
 * - 全局单例：放在 app/(app)/layout.tsx 中，确保只运行一个实例
 * - 自动响应：无论哪个页面触发 markInvoiceSending，都会自动启动轮询
 * - 跨页面同步：所有页面共享同一轮询状态
 */
export function InvoiceAutoPoller() {
  const sendingInvoiceHashes = useInvoiceStore((state) => state.sendingInvoiceHashes);
  const markInvoiceConfirmed = useInvoiceStore((state) => state.markInvoiceConfirmed);
  const updateInvoice = useInvoiceStore((state) => state.updateInvoice);
  
  // ✅ 使用 ref 追踪已经启动轮询的发票（避免重复启动）
  const pollingHashesRef = useRef<Set<AleoField>>(new Set());

  // ✅ 轮询完成回调：更新发票状态并从 sending 索引移除
  const handlePollingComplete = (invoiceHash: AleoField, updatedInvoice: Invoice) => {
    console.log(`✅ [AutoPoller] Polling complete for: ${invoiceHash}`);
    
    // 更新发票到 store（updateInvoice 会自动更新 sending 索引）
    updateInvoice(updatedInvoice.id, updatedInvoice, {
      masterKey: undefined, // Auto-poller 不处理加密，由具体页面决定
      persistFull: false     // 只更新内存，不持久化（避免覆盖用户数据）
    }).catch((error) => {
      console.error(`❌ [AutoPoller] Failed to update invoice ${invoiceHash}:`, error);
    });
    
    // 标记为已确认（从 sending 索引移除）
    markInvoiceConfirmed(invoiceHash);
    
    // 从追踪集合移除
    pollingHashesRef.current.delete(invoiceHash);
  };

  // ✅ 使用轮询 hook
  const { startPolling } = useInvoiceListPolling(handlePollingComplete);

  // ✅ 监听 sendingInvoiceHashes 变化，自动启动轮询
  useEffect(() => {
    const currentSendingHashes = Object.keys(sendingInvoiceHashes) as AleoField[];
    
    // 找出新增的 SENDING 发票（还未启动轮询的）
    const newHashes = currentSendingHashes.filter(
      hash => !pollingHashesRef.current.has(hash)
    );
    
    if (newHashes.length > 0) {
      console.log(`🔄 [AutoPoller] Detected ${newHashes.length} new SENDING invoice(s), starting polling...`);
      
      // 标记为已启动轮询
      newHashes.forEach(hash => pollingHashesRef.current.add(hash));
      
      // 启动轮询
      startPolling(newHashes);
    }
    
    // 清理：移除已不在 sending 列表中的 hash
    const currentHashSet = new Set(currentSendingHashes);
    for (const hash of pollingHashesRef.current) {
      if (!currentHashSet.has(hash)) {
        pollingHashesRef.current.delete(hash);
      }
    }
  }, [sendingInvoiceHashes, startPolling]);

  // ✅ 这是一个无 UI 的后台组件
  return null;
}
