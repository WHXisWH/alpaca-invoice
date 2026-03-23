import type { ICreditService } from './ICreditService';
import type {
  AleoField,
  Invoice,
  PaymentReceipt,
  CreditMetrics,
} from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { CREDIT_PROGRAM_ID, CREDIT_MAPPINGS } from '@/lib/contract';

export class CreditService implements ICreditService {
  private protocolService: AleoProtocolService;

  constructor() {
    this.protocolService = new AleoProtocolService();
  }

  collectMetrics(records: Invoice[], payments: PaymentReceipt[]): CreditMetrics {
    const allInvoices = records.filter(r =>
      r.status === InvoiceStatus.PAID ||
      r.status === InvoiceStatus.CANCELLED ||
      r.status === InvoiceStatus.PENDING
    );

    let paidOnTime = 0;
    let totalPaidAmount = BigInt(0);
    let firstInvoiceDate = Infinity;
    let disputeCount = 0;

    for (const inv of records) {
      const createdTs = inv.createdAt.getTime() / 1000;
      if (createdTs < firstInvoiceDate) {
        firstInvoiceDate = createdTs;
      }
      if (
        inv.status === InvoiceStatus.DISPUTED ||
        inv.status === InvoiceStatus.RESOLVED_CANCELLED ||
        inv.status === InvoiceStatus.RESOLVED_PAID
      ) {
        disputeCount++;
      }
    }

    for (const payment of payments) {
      totalPaidAmount += payment.amount;
      const invoice = records.find(r => r.id === payment.invoiceId);
      if (invoice && payment.paidAt <= invoice.dueDate) {
        paidOnTime++;
      }
    }

    const totalInvoices = allInvoices.length;
    const onTimeRate = totalInvoices > 0 ? (paidOnTime / totalInvoices) * 100 : 0;

    return {
      totalInvoices,
      paidOnTime,
      onTimeRate,
      totalPaidAmount,
      firstInvoiceDate: firstInvoiceDate === Infinity ? 0 : Math.floor(firstInvoiceDate),
      disputeCount,
    };
  }

  async getProofFromChain(proofId: AleoField): Promise<AleoField | null> {
    const result = await this.protocolService.getProgramMappingValue(
      CREDIT_PROGRAM_ID,
      CREDIT_MAPPINGS.credit_proofs,
      proofId
    );
    if (!result) return null;
    const cleaned = result.replace(/"/g, '').trim();
    if (cleaned === '0field') return null;
    return cleaned as AleoField;
  }
}
