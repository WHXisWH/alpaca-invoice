import type { IEscrowService } from './IEscrowService';
import type { AleoField, EscrowRecord } from '@/lib/types';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { PROGRAM_ID_V4, MAPPINGS_V4 } from '@/lib/contract';

export class EscrowService implements IEscrowService {
  private protocolService: AleoProtocolService;

  constructor() {
    this.protocolService = new AleoProtocolService();
  }

  async getEscrowByInvoiceId(invoiceId: AleoField): Promise<AleoField | null> {
    const result = await this.protocolService.getProgramMappingValue(
      PROGRAM_ID_V4,
      MAPPINGS_V4.escrow_registry,
      invoiceId
    );
    if (!result) return null;
    return result.replace(/"/g, '').trim() as AleoField;
  }

  isDeliveryExpired(escrowRecord: EscrowRecord): boolean {
    return new Date() > escrowRecord.deliveryDeadline;
  }
}
