'use client';

import {
  type AleoAddress,
  type AleoField,
  type AleoTransactionId,
  type PayInvoiceParams,
  type PaymentResult,
  type PaymentReceipt
} from '@/lib/types';

import { CREDITS_PROGRAM_ID, PROGRAM_ID } from '@/lib/program';
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
    amount: receipt.amount.toString(),
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

    console.log('Step 1/2: Fetching credits records...');

    // Get credits record plaintexts from wallet (not metadata)
    const creditsPlaintextsResponse = await wallet.requestRecordPlaintexts(CREDITS_PROGRAM_ID);
    const creditsPlaintexts = creditsPlaintextsResponse.records || [];
    console.log('Credits plaintexts:', creditsPlaintexts);

    // Filter unspent records
    const unspentPlaintexts = creditsPlaintexts.filter((r: any) => !r.spent);

    if (unspentPlaintexts.length === 0) {
      throw new Error('No credits available');
    }

    // Use first unspent record - should be plaintext string or object
    const creditsRecord = unspentPlaintexts[0];
    console.log('Using record:', creditsRecord);
    console.log('Record type:', typeof creditsRecord);
    console.log('Record JSON:', JSON.stringify(creditsRecord, null, 2));
    console.log('Step 1/2: Transferring credits...');

    // Step 1: Transfer credits
    const transferResponse = await wallet.requestTransaction({
      address: wallet.publicKey,
      chainId: 'testnetbeta',
      transitions: [{
        program: CREDITS_PROGRAM_ID,
        functionName: 'transfer_private',
        inputs: [creditsRecord, params.recipientAddress, `${params.amount.toString()}u64`]
      }],
      fee: 1000000,
      feePrivate: false
    });

    if (!transferResponse || !transferResponse.transactionId) {
      throw new Error('Credit transfer failed');
    }

    console.log('Credits transferred! TX:', transferResponse.transactionId);

    const paidTimestamp = Math.floor(Date.now() / 1000);

    console.log('Step 2/2: Fetching invoice records...');

    // Get invoice record plaintexts from wallet
    const invoicePlaintextsResponse = await wallet.requestRecordPlaintexts(PROGRAM_ID);
    const invoicePlaintexts = invoicePlaintextsResponse.records || [];
    const invoice = params.invoice;

    console.log('Invoice plaintexts:', invoicePlaintexts);
    console.log('Looking for invoice_id:', invoice.id);
    console.log('First record structure:', invoicePlaintexts[0]);

    // Find the matching invoice record by invoice_id
    const matchingRecord = invoicePlaintexts.find(
      (r: any) => !r.spent && r.data?.invoice_hash === invoice.invoiceHash
    );

    if (!matchingRecord) {
      throw new Error('Invoice record not found in wallet');
    }

    const invoiceRecord = matchingRecord;

    console.log('Step 2/2: Marking invoice as paid...');

    // Step 2: Mark as paid
    const markPaidResponse = await wallet.requestTransaction({
      address: wallet.publicKey,
      chainId: 'testnetbeta',
      transitions: [{
        program: PROGRAM_ID,
        functionName: 'mark_as_paid',
        inputs: [invoiceRecord, `${paidTimestamp}u32`]
      }],
      fee: 1000000,
      feePrivate: false
    });

    if (!markPaidResponse || !markPaidResponse.transactionId) {
      throw new Error(
        'Failed to mark as paid. Credits were transferred but status update failed. Transaction: ' +
          transferResponse.transactionId
      );
    }

    console.log('Invoice marked as paid! TX:', markPaidResponse.transactionId);

    // Generate payment ID
    const paymentId = invoice.id as AleoField;

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
