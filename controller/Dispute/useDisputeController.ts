'use client';

import { useCallback, useState } from 'react';
import type { IDisputeController } from './IDisputeController';
import type {
  AleoTransactionId,
  RaiseDisputeParams,
  ResolveDisputeParams,
  SubmitEvidenceParams,
  DisputeRecord,
  DisputeStatus,
  AleoField,
} from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';

export function useDisputeController(): IDisputeController {
  const txController = useTransactionController();
  const disputeStore = useDisputeStore();
  const [log, setLog] = useState('');

  const executeRaiseDispute = useCallback(async (params: RaiseDisputeParams): Promise<AleoTransactionId> => {
    setLog('Raising dispute...');
    try {
      const txId = await txController.executeRaiseDispute(params);

      const nowSec = Math.floor(Date.now() / 1000);
      const deadlineSec = nowSec + params.resolutionDeadlineDays * 86400;

      const dispute: DisputeRecord = {
        disputeId: `${txId}field` as AleoField,
        invoiceId: params.invoice.id,
        disputant: params.invoice.buyer,
        arbiter: params.arbiter ?? params.invoice.seller,
        reasonHash: params.reasonHash,
        evidenceHash: params.evidenceHash,
        status: 0 as DisputeStatus,
        createdAt: new Date(),
        resolutionDeadline: new Date(deadlineSec * 1000),
      };

      disputeStore.addDispute(dispute);
      setLog('Dispute raised successfully');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, disputeStore]);

  const executeResolveDispute = useCallback(async (params: ResolveDisputeParams): Promise<AleoTransactionId> => {
    setLog('Resolving dispute...');
    try {
      const txId = await txController.executeResolveDispute(params);
      disputeStore.updateDispute(params.dispute.disputeId, {
        status: params.resolution,
      });
      setLog('Dispute resolved');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, disputeStore]);

  const executeSubmitEvidence = useCallback(async (params: SubmitEvidenceParams): Promise<AleoTransactionId> => {
    setLog('Submitting evidence...');
    try {
      const txId = await txController.executeSubmitEvidence(params);
      disputeStore.updateDispute(params.dispute.disputeId, {
        evidenceHash: params.newEvidenceHash,
      });
      setLog('Evidence submitted');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, disputeStore]);

  return {
    isProcessing: txController.isProcessing,
    currentLog: log,
    executeRaiseDispute,
    executeResolveDispute,
    executeSubmitEvidence,
  };
}
