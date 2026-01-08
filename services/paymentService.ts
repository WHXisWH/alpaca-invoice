'use client';

import { randomField, randomTransactionId } from '@/lib/crypto';
import {
  type AleoField,
  type PaymentReceipt,
  type PaymentResult,
  type PayInvoiceParams,
  type AleoAddress,
  InvoiceStatus
} from '@/lib/types';
import { invoiceService } from './invoiceService';
import { saveTransaction } from '@/lib/storage';

const receipts: PaymentReceipt[] = [];

export const paymentService = {
  async pay(params: PayInvoiceParams, caller?: AleoAddress): Promise<PaymentResult> {
    const paymentId = randomField() as AleoField;
    const txId = randomTransactionId();
    const invoice = await invoiceService.getById(params.invoiceId);
    if (invoice) {
      invoice.status = InvoiceStatus.PAID;
    }
    if (invoice && caller) {
      const receipt: PaymentReceipt = {
        paymentId,
        invoiceId: params.invoiceId,
        payer: caller,
        payee: invoice.seller,
        amount: invoice.amount,
        paidAt: new Date()
      };
      receipts.push(receipt);
    }

    await saveTransaction({
      txId,
      type: 'pay',
      invoiceId: params.invoiceId,
      status: 'confirmed'
    });

    return {
      transactionId: txId,
      paymentId
    };
  },

  async getReceipt(paymentId: AleoField): Promise<PaymentReceipt | null> {
    return receipts.find((r) => r.paymentId === paymentId) ?? null;
  },

  async listReceipts(): Promise<PaymentReceipt[]> {
    return receipts;
  }
};
