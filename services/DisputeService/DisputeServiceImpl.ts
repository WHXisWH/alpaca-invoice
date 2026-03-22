import type { IDisputeService } from './IDisputeService';
import type { AleoField } from '@/lib/types';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { PROGRAM_ID_V4, MAPPINGS_V4 } from '@/lib/contract';

export class DisputeService implements IDisputeService {
  private protocolService: AleoProtocolService;

  constructor() {
    this.protocolService = new AleoProtocolService();
  }

  async getDisputeByInvoiceId(invoiceId: AleoField): Promise<AleoField | null> {
    const result = await this.protocolService.getProgramMappingValue(
      PROGRAM_ID_V4,
      MAPPINGS_V4.dispute_registry,
      invoiceId
    );
    if (!result) return null;
    return result.replace(/"/g, '').trim() as AleoField;
  }

  async getDisputeStatus(disputeId: AleoField): Promise<number | null> {
    const result = await this.protocolService.getProgramMappingValue(
      PROGRAM_ID_V4,
      MAPPINGS_V4.dispute_status,
      disputeId
    );
    if (!result) return null;
    const cleaned = result.replace(/"/g, '').replace('u8', '').trim();
    return parseInt(cleaned, 10);
  }

  async getDisputeResolution(disputeId: AleoField): Promise<AleoField | null> {
    const result = await this.protocolService.getProgramMappingValue(
      PROGRAM_ID_V4,
      MAPPINGS_V4.dispute_resolution,
      disputeId
    );
    if (!result) return null;
    return result.replace(/"/g, '').trim() as AleoField;
  }
}
