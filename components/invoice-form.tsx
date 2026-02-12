'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AleoAddress, AleoField, InvoiceDetails } from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';

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
  const { executeCreateInvoice, executeSetAuditAuthorization, isProcessing, currentProgress, currentLog } =
    useTransactionController();
  const { publicKey } = useUserStore();
  const { handleError } = useErrorHandler();
  const [buyer, setBuyer] = useState('');
  const [amount, setAmount] = useState('1');
  const [description, setDescription] = useState('Service fee');
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [enableAuditAuth, setEnableAuditAuth] = useState(false);
  const [auditKey, setAuditKey] = useState('');
  const [scopes, setScopes] = useState<string[]>(['amount', 'tax_amount', 'buyer', 'seller']);
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const cryptoService = new CryptoService();

  const toggleScope = (key: string) => {
    setScopes((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  };

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
      // Optional: set audit authorization after invoice is on-chain
      if (enableAuditAuth) {
        try {
          const scopesBitmask = scopes.reduce((mask, key) => {
            const ids: Record<string, number> = {
              amount: 1,
              tax_amount: 2,
              due_date: 3,
              buyer: 4,
              seller: 5,
              currency: 6,
              items_hash: 7,
              memo_hash: 8,
              order_id: 9
            };
            const id = ids[key];
            if (id) {
              return mask | (1n << BigInt(id - 1));
            }
            return mask;
          }, 0n);
          const auditKeyHash = await cryptoService.hashObjectToField(auditKey || 'audit-key');
          const expiresSec = Math.floor(new Date(expiresAt).getTime() / 1000);
          await executeSetAuditAuthorization(
            {
              id: invoiceHash as AleoField,
              invoiceHash: invoiceHash as AleoField,
              seller: publicKey as AleoAddress,
              buyer: buyer as AleoAddress,
              amount: microcredits,
              dueDate: new Date(dueDate),
              createdAt: new Date(),
              status: 0,
              metadata: {
                confirmationStatus: 'SENDING',
                lastUpdated: new Date(),
                dataSource: 'local',
                action: 'create'
              }
            } as any,
            auditKeyHash,
            scopesBitmask,
            expiresSec
          );
        } catch (authErr) {
          console.warn('Audit authorization not set:', authErr);
        }
      }
      
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
      className="surface-card space-y-4 p-6"
    >
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">
          Seller address (current wallet)
        </label>
        <div className="rounded-lg border border-primary-200/60 bg-primary-50/70 px-3 py-2 text-sm text-slate-700">
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
          className="input-field"
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
          className="input-field"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="input-field"
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Audit authorization</div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enableAuditAuth}
              onChange={(e) => setEnableAuditAuth(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            Enable
          </label>
        </div>
        {enableAuditAuth && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Audit key</label>
              <input
                type="text"
                value={auditKey}
                onChange={(e) => setAuditKey(e.target.value)}
                className="input-field"
                placeholder="Random string or hex"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Expiry</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Scopes</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  'amount',
                  'tax_amount',
                  'due_date',
                  'buyer',
                  'seller',
                  'currency',
                  'items_hash',
                  'memo_hash',
                  'order_id'
                ].map((s) => (
                  <label key={s} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={scopes.includes(s)}
                      onChange={() => toggleScope(s)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Progress indicator */}
      {isProcessing && (
        <div className="space-y-2 rounded-lg border border-blue-200/60 bg-blue-50/70 p-4">
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
        className="w-full cursor-pointer rounded-lg bg-primary-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isProcessing ? 'Processing...' : 'Create invoice'}
      </button>
    </form>
  );
}
