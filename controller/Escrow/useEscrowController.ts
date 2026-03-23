'use client';

import { useCallback, useState } from 'react';
import type { IEscrowController } from './IEscrowController';
import type {
  AleoTransactionId,
  EscrowPaymentParams,
  ConfirmDeliveryParams,
  TimeoutRefundParams,
  EscrowRecord,
  EscrowStatus,
  AleoField,
  CurrencyFlag,
} from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';

export function useEscrowController(): IEscrowController {
  const txController = useTransactionController();
  const escrowStore = useEscrowStore();
  const [log, setLog] = useState('');

  const executeEscrowPayment = useCallback(async (params: EscrowPaymentParams): Promise<AleoTransactionId> => {
    setLog('Locking payment in escrow...');
    try {
      const txId = await txController.executeEscrowPayment(params);

      const escrow: EscrowRecord = {
        escrowId: `${txId}field` as AleoField,
        invoiceId: params.invoice.id,
        payer: params.invoice.buyer,
        payee: params.invoice.seller,
        amount: params.invoice.totalAmount ?? params.invoice.amount,
        currencyFlag: params.invoice.currencyFlag ?? (0 as CurrencyFlag),
        deliveryDeadline: params.escrowConfig.deliveryDeadline,
        arbiter: params.escrowConfig.arbiter ?? params.invoice.seller,
        status: 0 as EscrowStatus,
      };

      escrowStore.addEscrow(escrow);
      setLog('Payment locked in escrow');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, escrowStore]);

  const executeConfirmDelivery = useCallback(async (params: ConfirmDeliveryParams): Promise<AleoTransactionId> => {
    setLog('Confirming delivery and releasing funds...');
    try {
      const txId = await txController.executeConfirmDelivery(params);
      escrowStore.updateEscrow(params.escrow.escrowId, {
        status: 1 as EscrowStatus,
      });
      setLog('Delivery confirmed, funds released');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, escrowStore]);

  const executeTimeoutRefund = useCallback(async (params: TimeoutRefundParams): Promise<AleoTransactionId> => {
    setLog('Processing timeout refund...');
    try {
      const txId = await txController.executeTimeoutRefund(params);
      escrowStore.updateEscrow(params.escrow.escrowId, {
        status: 2 as EscrowStatus,
      });
      setLog('Refund processed');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, escrowStore]);

  return {
    isProcessing: txController.isProcessing,
    currentLog: log,
    executeEscrowPayment,
    executeConfirmDelivery,
    executeTimeoutRefund,
  };
}
