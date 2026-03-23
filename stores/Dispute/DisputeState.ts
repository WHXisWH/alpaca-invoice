import type { DisputeRecord, AleoField } from '@/lib/types';

export interface DisputeState {
  disputes: DisputeRecord[];
  currentDispute: DisputeRecord | null;
  isLoading: boolean;

  addDispute(dispute: DisputeRecord): void;
  updateDispute(disputeId: AleoField, data: Partial<DisputeRecord>): void;
  setCurrentDispute(dispute: DisputeRecord | null): void;
  removeDispute(disputeId: AleoField): void;
  getDisputesByInvoiceId(invoiceId: AleoField): DisputeRecord[];
}
