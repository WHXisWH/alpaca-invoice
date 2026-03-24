'use client';

import { useCallback, useState } from 'react';
import type { IEscrowController } from './IEscrowController';
import type {
  AleoTransactionId,
  EscrowPaymentParams,
  ConfirmDeliveryParams,
  TimeoutRefundParams,
  ArbiterResolveParams,
  EscrowRecord,
  EscrowStatus,
  AleoField,
  CurrencyFlag,
} from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';

export function useEscrowController(): IEscrowController {
  const txController = useTransactionController();
  const escrowStore = useEscrowStore();
  const invoiceStore = useInvoiceStore();
  const masterKey = useUserStore((s) => s.masterKey);
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
      invoiceStore.updateInvoice(
        params.invoice.id,
        { status: InvoiceStatus.ESCROWED },
        { masterKey: masterKey ?? undefined }
      );
      setLog('Payment locked in escrow');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, escrowStore, invoiceStore, masterKey]);

  const executeConfirmDelivery = useCallback(async (params: ConfirmDeliveryParams): Promise<AleoTransactionId> => {
    setLog('Confirming delivery and releasing funds...');
    try {
      const txId = await txController.executeConfirmDelivery(params);
      escrowStore.updateEscrow(params.escrow.escrowId, {
        status: 1 as EscrowStatus,
      });
      invoiceStore.updateInvoice(
        params.invoice.id,
        { status: InvoiceStatus.PAID },
        { masterKey: masterKey ?? undefined }
      );
      setLog('Delivery confirmed, funds released');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, escrowStore, invoiceStore, masterKey]);

  const executeTimeoutRefund = useCallback(async (params: TimeoutRefundParams): Promise<AleoTransactionId> => {
    setLog('Processing timeout refund...');
    try {
      const txId = await txController.executeTimeoutRefund(params);
      escrowStore.updateEscrow(params.escrow.escrowId, {
        status: 2 as EscrowStatus,
      });
      invoiceStore.updateInvoice(
        params.invoice.id,
        { status: InvoiceStatus.REFUNDED },
        { masterKey: masterKey ?? undefined }
      );
      setLog('Refund processed');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, escrowStore, invoiceStore, masterKey]);

  const executeArbiterResolve = useCallback(async (params: ArbiterResolveParams): Promise<AleoTransactionId> => {
    setLog('Arbiter resolving escrow...');
    try {
      const txId = await txController.executeArbiterResolve(params);
      const newEscrowStatus = params.decision === 'release' ? 1 : 2;
      const newInvoiceStatus = params.decision === 'release' ? InvoiceStatus.PAID : InvoiceStatus.REFUNDED;
      escrowStore.updateEscrow(params.escrow.escrowId, {
        status: newEscrowStatus as EscrowStatus,
      });
      invoiceStore.updateInvoice(
        params.invoice.id,
        { status: newInvoiceStatus },
        { masterKey: masterKey ?? undefined }
      );
      setLog(params.decision === 'release' ? 'Funds released to seller' : 'Funds refunded to buyer');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, escrowStore, invoiceStore, masterKey]);

  return {
    isProcessing: txController.isProcessing,
    currentLog: log,
    executeEscrowPayment,
    executeConfirmDelivery,
    executeTimeoutRefund,
    executeArbiterResolve,
  };
}
