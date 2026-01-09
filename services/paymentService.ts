'use client';

import { randomField } from '@/lib/crypto';
import {
  type AleoAddress,
  type AleoField,
  type AleoTransactionId,
  type PayInvoiceParams,
  type PaymentResult,
  type PaymentReceipt
} from '@/lib/types';

const PROGRAM_ID = 'zk_invoice.aleo';
const CREDITS_PROGRAM = 'credits.aleo';
const RECEIPTS_KEY = 'zk_invoice_receipts';

function getWallet() {
  if (typeof window !== 'undefined' && (window as any).leoWallet) {
    return (window as any).leoWallet;
  }
  throw new Error('Leo Wallet not found');
}

function saveReceipt(receipt: PaymentReceipt) {
  if (typeof window === 'undefined') return;
  const stored = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || '[]');
  stored.push({
    ...receipt,
    paidAt: receipt.paidAt.toISOString()
  });
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify(stored));
}

function getAllReceipts(): PaymentReceipt[] {
  if (typeof window === 'undefined') return [];
  const stored = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || '[]');
  return stored.map((r: any) => ({
    ...r,
    amount: BigInt(r.amount),
    paidAt: new Date(r.paidAt)
  }));
}

export const paymentService = {
  /**
   * Pay invoice - Complete two-step process
   */
  async pay(params: {
    invoice: any; // Invoice object from localStorage
    recipientAddress: AleoAddress;
    amount: bigint;
  }): Promise<PaymentResult> {
    const wallet = getWallet();

    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    console.log('Step 1/2: Transferring credits...');

    // Step 1: Transfer credits
    const transferResponse = await wallet.requestTransaction({
      program: CREDITS_PROGRAM,
      functionName: 'transfer_private',
      inputs: [params.recipientAddress, `${params.amount.toString()}u64`],
      fee: 1000000,
      wait: true
    });

    if (!transferResponse || !transferResponse.transactionId) {
      throw new Error('Credit transfer failed');
    }

    console.log('Credits transferred! TX:', transferResponse.transactionId);

    // Generate payment nonce
    const paymentNonce = randomField() as AleoField;

    console.log('Step 2/2: Marking invoice as paid...');

    // Build InvoiceRecord string
    const invoice = params.invoice;
    const recordStr = `{
      owner: ${invoice.buyer},
      invoice_id: ${invoice.id},
      seller: ${invoice.seller},
      buyer: ${invoice.buyer},
      amount: ${invoice.amount.toString()}u64,
      invoice_hash: ${invoice.invoiceHash},
      due_date: ${Math.floor(invoice.dueDate.getTime() / 1000)}u32,
      created_at: ${Math.floor(invoice.createdAt.getTime() / 1000)}u32,
      status: ${invoice.status}u8
    }`;

    // Step 2: Mark as paid
    const markPaidResponse = await wallet.requestTransaction({
      program: PROGRAM_ID,
      functionName: 'mark_as_paid',
      inputs: [recordStr, paymentNonce],
      fee: 1000000,
      wait: true
    });

    if (!markPaidResponse || !markPaidResponse.transactionId) {
      throw new Error(
        'Failed to mark as paid. Credits were transferred but status update failed. Transaction: ' +
          transferResponse.transactionId
      );
    }

    console.log('Invoice marked as paid! TX:', markPaidResponse.transactionId);

    // Generate payment ID
    const paymentId = `${paymentNonce.slice(0, 32)}field` as AleoField;

    // Save receipt to localStorage
    const receipt: PaymentReceipt = {
      paymentId: paymentId,
      invoiceId: invoice.id as AleoField,
      payer: wallet.publicKey as AleoAddress,
      payee: invoice.seller as AleoAddress,
      amount: params.amount,
      paidAt: new Date()
    };

    saveReceipt(receipt);

    return {
      transactionId: markPaidResponse.transactionId as AleoTransactionId,
      paymentId: paymentId
    };
  },

  async getReceipt(paymentId: AleoField): Promise<PaymentReceipt | null> {
    const receipts = getAllReceipts();
    return receipts.find((r) => r.paymentId === paymentId) || null;
  },

  async listReceipts(): Promise<PaymentReceipt[]> {
    return getAllReceipts();
  }
};
