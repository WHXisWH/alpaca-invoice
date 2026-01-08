'use client';

import { useState } from 'react';
import type { AleoAddress, InvoiceDetails } from '@/lib/types';
import { useInvoiceStore } from '@/stores/invoiceStore';
import { useWalletStore } from '@/stores/walletStore';

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
  const { createInvoice, isLoading, error } = useInvoiceStore();
  const { address } = useWalletStore();
  const [buyer, setBuyer] = useState('');
  const [amount, setAmount] = useState('1');
  const [description, setDescription] = useState('Service fee');
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    const microcredits = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
    const details = buildDetails(
      `INV-${Date.now()}`,
      description,
      parseFloat(amount)
    );
    try {
      const result = await createInvoice({
        buyer: buyer as AleoAddress,
        amount: microcredits,
        dueDate: new Date(dueDate),
        details
      });
      setMessage(
        `Invoice created: invoiceId=${result.invoiceId}, tx=${result.transactionId}`
      );
    } catch (err) {
      setMessage((err as Error).message);
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
          {address || 'Not connected'}
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
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isLoading ? 'Submitting...' : 'Create invoice'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}
    </form>
  );
}
