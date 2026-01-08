'use client';

import {
  encryptInvoiceDetails,
  generateInvoiceHash,
  randomField,
  randomTransactionId
} from '@/lib/crypto';
import {
  type AleoAddress,
  type AleoField,
  type AleoTransactionId,
  type CreateInvoiceParams,
  type CreateInvoiceResult,
  type Invoice,
  InvoiceStatus,
  type InvoiceDetails
} from '@/lib/types';
import { saveEncryptedInvoice, saveTransaction } from '@/lib/storage';

const invoiceCache: Invoice[] = [];

function getSellerAddress(): AleoAddress {
  const envAddress =
    (process.env.NEXT_PUBLIC_ALEO_ADDRESS) as
      | AleoAddress
      | undefined;
  return envAddress || ('aleo1sellerdemoaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxx' as AleoAddress);
}

export const invoiceService = {
  async create(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    const seller = getSellerAddress();
    const invoiceId = randomField() as AleoField;
    const invoiceHash = (await generateInvoiceHash(params.details)) as AleoField;
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const encryptedDetails = await encryptInvoiceDetails(
      params.details as InvoiceDetails,
      encryptionKey
    );

    const invoice: Invoice = {
      id: invoiceId,
      seller,
      buyer: params.buyer,
      amount: params.amount,
      invoiceHash,
      dueDate: params.dueDate,
      createdAt: new Date(),
      status: InvoiceStatus.PENDING,
      details: params.details
    };

    invoiceCache.push(invoice);
    await saveEncryptedInvoice(invoiceId, encryptedDetails);
    await saveTransaction({
      txId: randomTransactionId(),
      type: 'create',
      invoiceId,
      status: 'confirmed'
    });

    return {
      transactionId: randomTransactionId(),
      invoiceId,
      invoiceHash,
      encryptedDetails
    };
  },

  async getById(id: AleoField): Promise<Invoice | null> {
    return invoiceCache.find((i) => i.id === id) ?? null;
  },

  async listByRole(role: 'seller' | 'buyer', address?: AleoAddress): Promise<Invoice[]> {
    if (!address) return invoiceCache;
    return invoiceCache.filter((i) =>
      role === 'seller' ? i.seller === address : i.buyer === address
    );
  },

  async cancel(id: AleoField): Promise<AleoTransactionId> {
    const tx = randomTransactionId();
    const invoice = invoiceCache.find((i) => i.id === id);
    if (invoice) {
      invoice.status = InvoiceStatus.CANCELLED;
    }
    await saveTransaction({
      txId: tx,
      type: 'cancel',
      invoiceId: id,
      status: 'confirmed'
    });
    return tx;
  },

  async verify(id: AleoField, hash: AleoField): Promise<boolean> {
    const invoice = invoiceCache.find((i) => i.id === id);
    if (!invoice) return false;
    return invoice.invoiceHash === hash;
  }
};
