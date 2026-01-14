'use client';

import { useState } from 'react';
import type { AleoAddress, InvoiceDetails } from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { toast } from 'sonner';

function buildDetails(
  invoiceNumber: string,
  description: string,
  amountCredits: number
): InvoiceDetails {
  const subtotal = amountCredits;
  const taxRate = 0;
  const taxAmount = 0;
  const total = subtotal + taxAmount;
  return {
    invoiceNumber,
    lineItems: [
      {
        description,
        quantity: 1,
        unitPrice: subtotal,
        amount: subtotal
      }
    ],
    subtotal,
    taxRate,
    taxAmount,
    total,
    currency: 'CREDITS'
  };
}

export default function InvoiceForm() {
  const { executeCreateInvoice, isProcessing, currentProgress, currentLog } = useTransactionController();
  const { publicKey } = useUserStore();
  const { handleError } = useErrorHandler();
  const [buyer, setBuyer] = useState('');
  const [amount, setAmount] = useState('1');
  const [description, setDescription] = useState('Service fee');
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const microcredits = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
    const details = buildDetails(
      `INV-${Date.now()}`,
      description,
      parseFloat(amount)
    );
    
    try {
      const transactionId = await executeCreateInvoice({
        buyer: buyer as AleoAddress,
        amount: microcredits,
        dueDate: new Date(dueDate),
        details
      });
      console.log('transactionId', transactionId)
      
      // 成功时显示通知
      toast.success('发票创建成功！', {
        description: `交易ID: ${transactionId.slice(0, 20)}...`
      });
    } catch (err) {
      // 统一错误处理
      handleError(err);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          Seller address (current wallet)
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {publicKey || 'Not connected'}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Buyer address</label>
        <input
          type="text"
          required
          value={buyer}
          onChange={(e) => setBuyer(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          placeholder="aleo1..."
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Amount (credits)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>
      
      {/* 进度显示 */}
      {isProcessing && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">处理中...</span>
            <span className="text-sm text-blue-700">{currentProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${currentProgress}%` }}
            />
          </div>
          {currentLog && (
            <p className="text-xs text-blue-800">{currentLog}</p>
          )}
        </div>
      )}
      
      <button
        type="submit"
        disabled={isProcessing}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isProcessing ? '处理中...' : 'Create invoice'}
      </button>
    </form>
  );
}
