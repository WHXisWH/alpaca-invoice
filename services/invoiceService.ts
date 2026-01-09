'use client';

import { generateInvoiceHash, randomField } from '@/lib/crypto';
import {
  type AleoAddress,
  type AleoField,
  type AleoTransactionId,
  type CreateInvoiceParams,
  type CreateInvoiceResult,
  type Invoice,
  InvoiceStatus
} from '@/lib/types';

const PROGRAM_ID = 'zk_invoice.aleo';
const STORAGE_KEY = 'zk_invoice_records';

// Get wallet instance
function getWallet() {
  if (typeof window !== 'undefined' && (window as any).leoWallet) {
    return (window as any).leoWallet;
  }
  throw new Error('Leo Wallet not found. Please install Leo Wallet extension.');
}

// localStorage helpers
function saveInvoice(invoice: Invoice) {
  if (typeof window === 'undefined') return;
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  stored.push({
    ...invoice,
    dueDate: invoice.dueDate.toISOString(),
    createdAt: invoice.createdAt.toISOString()
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function getAllInvoices(): Invoice[] {
  if (typeof window === 'undefined') return [];
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  return stored.map((inv: any) => ({
    ...inv,
    amount: BigInt(inv.amount),
    dueDate: new Date(inv.dueDate),
    createdAt: new Date(inv.createdAt)
  }));
}

function updateInvoiceStatus(invoiceId: AleoField, status: InvoiceStatus) {
  if (typeof window === 'undefined') return;
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const updated = stored.map((inv: any) =>
    inv.id === invoiceId ? { ...inv, status } : inv
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export const invoiceService = {
  async create(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    const wallet = getWallet();

    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    const seller = wallet.publicKey as AleoAddress;

    // Generate invoice hash and nonce
    const invoiceHash = (await generateInvoiceHash(params.details)) as AleoField;
    const nonce = randomField() as AleoField;
    const dueTimestamp = Math.floor(params.dueDate.getTime() / 1000);
    const amountStr = `${params.amount.toString()}u64`;

    console.log('Creating invoice on-chain...');

    // Call real contract
    const response = await wallet.requestTransaction({
      program: PROGRAM_ID,
      functionName: 'create_invoice',
      inputs: [
        params.buyer,
        amountStr,
        `${dueTimestamp}u32`,
        invoiceHash,
        nonce
      ],
      fee: 1000000,
      wait: true,
      network: 'testnetbeta'
    });

    if (!response || !response.transactionId) {
      throw new Error('Transaction failed');
    }

    console.log('Invoice created! TX:', response.transactionId);

    // Generate invoice ID (use nonce as base)
    const invoiceId = `${nonce.slice(0, 32)}field` as AleoField;

    // Save to localStorage
    const invoice: Invoice = {
      id: invoiceId,
      seller: seller,
      buyer: params.buyer,
      amount: params.amount,
      invoiceHash: invoiceHash,
      dueDate: params.dueDate,
      createdAt: new Date(),
      status: InvoiceStatus.PENDING,
      details: params.details
    };

    saveInvoice(invoice);

    return {
      transactionId: response.transactionId as AleoTransactionId,
      invoiceId: invoiceId,
      invoiceHash: invoiceHash,
      encryptedDetails: {
        iv: '',
        ciphertext: JSON.stringify(params.details)
      }
    };
  },

  async getById(id: AleoField): Promise<Invoice | null> {
    const invoices = getAllInvoices();
    return invoices.find((inv) => inv.id === id) || null;
  },

  async listByRole(role: 'seller' | 'buyer', address?: AleoAddress): Promise<Invoice[]> {
    if (!address) return [];
    const invoices = getAllInvoices();
    return invoices.filter((inv) =>
      role === 'seller' ? inv.seller === address : inv.buyer === address
    );
  },

  async cancel(invoiceId: AleoField): Promise<void> {
    const wallet = getWallet();

    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    // Find invoice
    const invoice = await this.getById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.PENDING) {
      throw new Error('Can only cancel pending invoices');
    }

    // Build InvoiceRecord string for contract call
    const recordStr = `{
      owner: ${invoice.seller},
      invoice_id: ${invoice.id},
      seller: ${invoice.seller},
      buyer: ${invoice.buyer},
      amount: ${invoice.amount.toString()}u64,
      invoice_hash: ${invoice.invoiceHash},
      due_date: ${Math.floor(invoice.dueDate.getTime() / 1000)}u32,
      created_at: ${Math.floor(invoice.createdAt.getTime() / 1000)}u32,
      status: ${invoice.status}u8
    }`;

    console.log('Cancelling invoice on-chain...');

    // Call cancel_invoice
    const response = await wallet.requestTransaction({
      program: PROGRAM_ID,
      functionName: 'cancel_invoice',
      inputs: [recordStr],
      fee: 1000000,
      wait: true,
      network: 'testnetbeta'
    });

    if (!response || !response.transactionId) {
      throw new Error('Cancel transaction failed');
    }

    console.log('Invoice cancelled! TX:', response.transactionId);

    // Update localStorage
    updateInvoiceStatus(invoiceId, InvoiceStatus.CANCELLED);
  },

  async markAsPaid(invoiceId: AleoField): Promise<void> {
    updateInvoiceStatus(invoiceId, InvoiceStatus.PAID);
  }
};
