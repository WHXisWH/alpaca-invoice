import { createServiceError } from '@/lib/service-errors';
import type { AleoField, EscrowRecord } from '@/lib/types';

export enum EscrowError {
  NOT_ESCROWED = 'NOT_ESCROWED',
  DELIVERY_NOT_EXPIRED = 'DELIVERY_NOT_EXPIRED',
  ALREADY_RELEASED = 'ALREADY_RELEASED',
  INSUFFICIENT_TOKEN = 'INSUFFICIENT_TOKEN'
}

export const EscrowServiceError = createServiceError<EscrowError>('EscrowService');
export type EscrowServiceError = InstanceType<typeof EscrowServiceError>;

/**
 * Service for querying escrow-related on-chain mappings
 * from zk_invoice_v4.aleo.
 */
export interface IEscrowService {
  /** Look up escrow_registry mapping: invoice_id => escrow_id */
  getEscrowByInvoiceId(invoiceId: AleoField): Promise<AleoField | null>;

  /** Determine whether the delivery deadline has passed for an escrow. */
  isDeliveryExpired(escrowRecord: EscrowRecord): boolean;
}
