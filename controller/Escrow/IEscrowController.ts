import type {
  AleoTransactionId,
  EscrowPaymentParams,
  ConfirmDeliveryParams,
  TimeoutRefundParams,
} from '@/lib/types';

export interface IEscrowController {
  isProcessing: boolean;
  currentLog: string;

  executeEscrowPayment(params: EscrowPaymentParams): Promise<AleoTransactionId>;
  executeConfirmDelivery(params: ConfirmDeliveryParams): Promise<AleoTransactionId>;
  executeTimeoutRefund(params: TimeoutRefundParams): Promise<AleoTransactionId>;
}
