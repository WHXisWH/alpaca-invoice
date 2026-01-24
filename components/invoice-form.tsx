'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AleoAddress, InvoiceDetails } from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';

function buildDetails(
  invoiceNumber: string,
  description: string,
  amountCredits: number
): InvoiceDetails {
  // Normalize numbers to 6 decimals to avoid floating-point drift
  const subtotal = Math.round(amountCredits * 1000000) / 1000000;
  const taxRate = 0;
  const taxAmount = 0;
  const total = Math.round((subtotal + taxAmount) * 1000000) / 1000000;
  
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
    // Leave notes undefined
  };
}

export default function InvoiceForm() {
  const router = useRouter();
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

    // Basic validation: trim, validate Aleo address format, and prevent seller invoicing themselves
    const buyerAddress = buyer.trim();
    const ALEO_ADDR_REGEX = /^aleo1[0-9a-z]{58}$/;

    if (!ALEO_ADDR_REGEX.test(buyerAddress)) {
      handleError(new Error('Invalid buyer address. It must start with aleo1 and be 63 characters long.'));
      return;
    }

    if (publicKey && buyerAddress === publicKey) {
      handleError(new Error('Buyer address cannot be the same as the current wallet address.'));
      return;
    }

    // Write the trimmed address back so later steps use the cleaned value
    if (buyerAddress !== buyer) {
      setBuyer(buyerAddress);
    }

    const microcredits = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
    const details = buildDetails(
      `INV-${Date.now()}`,
      description,
      parseFloat(amount)
    );
    
    try {
      const invoiceHash = await executeCreateInvoice({
        buyer: buyer as AleoAddress,
        amount: microcredits,
        dueDate: new Date(dueDate),
        details
      });
      
      // After archiving, jump to invoice detail page; the page will poll while status is SENDING
      router.push(`/invoices/${invoiceHash}`);
    } catch (err) {
      // Centralized error handling
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
      
      {/* Progress indicator */}
      {isProcessing && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">Processing...</span>
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
        {isProcessing ? 'Processing...' : 'Create invoice'}
      </button>
    </form>
  );
}
