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
    amount: invoice.amount.toString(),
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
    console.log('Transaction params:', {
      seller,
      buyer: params.buyer,
      amount: amountStr,
      dueDate: `${dueTimestamp}u32`,
      invoiceHash,
      nonce
    });

    // Call real contract
    const response = await wallet.requestTransaction({
      address: seller,
      chainId: 'testnetbeta',
      transitions: [{
        program: PROGRAM_ID,
        functionName: 'create_invoice',
        inputs: [
          params.buyer,
          amountStr,
          `${dueTimestamp}u32`,
          invoiceHash,
          nonce
        ]
      }],
      fee: 1000000,
      feePrivate: false
    });

    console.log('Transaction response:', response);

    if (!response) {
      throw new Error('Transaction failed - no response');
    }

    if (!response.transactionId) {
      throw new Error('Transaction failed - no transaction ID');
    }

    console.log('Transaction submitted! Local UUID:', response.transactionId);

    // The returned ID is a UUID, not the on-chain TX ID
    // Try to get transaction status
    console.log('Checking transaction status...');

    let realTransactionId = response.transactionId;

    try {
      // First try transactionStatus
      const status = await wallet.transactionStatus(response.transactionId);
      console.log('Transaction status:', status);
    } catch (err) {
      console.log('Status check failed:', err);
    }

    // Try to get recent transaction history for this program
    console.log('Fetching recent transaction history...');

    try {
      const historyResponse = await wallet.requestTransactionHistory(PROGRAM_ID);
      console.log('Transaction history response:', historyResponse);

      const history = historyResponse.transactions || historyResponse || [];
      console.log('Recent transactions:', history);

      if (history.length > 0) {
        // Get the most recent transaction (should be the one we just submitted)
        const latestTx = history[0];
        console.log('Latest transaction:', latestTx);
        console.log('Transaction keys:', Object.keys(latestTx));
        console.log('Full transaction JSON:', JSON.stringify(latestTx, null, 2));

        // Try different possible field names
        const possibleId =
          latestTx.transaction_id ||
          latestTx.transactionId ||
          latestTx.txId ||
          latestTx.id;

        if (possibleId && typeof possibleId === 'string' && possibleId.startsWith('at1')) {
          realTransactionId = possibleId;
          console.log('Found transaction ID from history:', realTransactionId);
        }
      }
    } catch (err) {
      console.log('Transaction history fetch failed:', err);
    }

    if (!realTransactionId.startsWith('at1')) {
      console.warn(
        'Could not get on-chain TX ID. Using UUID. Check wallet transaction history manually.'
      );
    }

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
      transactionId: realTransactionId as AleoTransactionId,
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

    console.log('Fetching invoice records from wallet...');

    // Get invoice record plaintexts from wallet
    const invoicePlaintextsResponse = await wallet.requestRecordPlaintexts(PROGRAM_ID);
    const invoicePlaintexts = invoicePlaintextsResponse.records || [];

    // Find the matching invoice record by invoice_id
    const matchingRecord = invoicePlaintexts.find(
      (r: any) => !r.spent && r.data?.invoice_id === invoiceId
    );

    if (!matchingRecord) {
      throw new Error('Invoice record not found in wallet');
    }

    const record = matchingRecord;

    console.log('Cancelling invoice on-chain...');

    // Call cancel_invoice
    const response = await wallet.requestTransaction({
      address: wallet.publicKey,
      chainId: 'testnetbeta',
      transitions: [{
        program: PROGRAM_ID,
        functionName: 'cancel_invoice',
        inputs: [record]
      }],
      fee: 1000000,
      feePrivate: false
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
