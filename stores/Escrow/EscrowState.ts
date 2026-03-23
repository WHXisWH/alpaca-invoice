import type { EscrowRecord, AleoField } from '@/lib/types';

export interface EscrowState {
  escrows: EscrowRecord[];
  currentEscrow: EscrowRecord | null;
  isLoading: boolean;

  addEscrow(escrow: EscrowRecord): void;
  updateEscrow(escrowId: AleoField, data: Partial<EscrowRecord>): void;
  setCurrentEscrow(escrow: EscrowRecord | null): void;
  getEscrowByInvoiceId(invoiceId: AleoField): EscrowRecord | undefined;
}
