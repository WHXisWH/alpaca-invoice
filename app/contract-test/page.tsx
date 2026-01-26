'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { generateInvoiceHash } from '@/lib/crypto';
import { PROGRAM_ID, CREDITS_PROGRAM_ID } from '@/lib/program';
import { getChainIdFromNetwork, getNetworkFromEnv } from '@/lib/network';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { createWalletAdapter } from '@/controller/Wallet/useWalletController';
import { useInvoiceChainScan } from '@/controller/Invoice/useInvoiceChainScan';

type RequestState = 'idle' | 'loading' | 'success' | 'error';

export default function ContractTestPage() {
  const wallet = useWallet();
  const [status, setStatus] = useState<RequestState>('idle');
  const [message, setMessage] = useState<string>('');

  const [buyer, setBuyer] = useState('');
  const [amountCredits, setAmountCredits] = useState('1');
  const [description, setDescription] = useState('Test invoice');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [createdInvoiceHash, setCreatedInvoiceHash] = useState('');

  const [invoiceRecordObject, setInvoiceRecordObject] = useState<any | null>(null);
  const [expectedHash, setExpectedHash] = useState('');
  const [paidAt, setPaidAt] = useState(Math.floor(Date.now() / 1000).toString());

  const walletService = useMemo(
    () => (wallet ? new WalletService(createWalletAdapter(wallet)) : null),
    [wallet]
  );
  const { scanInvoiceRecord } = useInvoiceChainScan();

  const formatError = (error: any) => {
    return (
      error?.message ||
      error?.error?.message ||
      error?.code ||
      JSON.stringify(error)
    );
  };

  const requestTx = async (transitions: Array<{ program: string; functionName: string; inputs: string[] }>) => {
    if (!wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    if (!walletService) {
      throw new Error('Wallet service not initialized');
    }
    if (transitions.length !== 1) {
      throw new Error('Contract test supports one transition per request');
    }
    const { functionName, inputs } = transitions[0];
    const chainId = getChainIdFromNetwork(getNetworkFromEnv());
    return walletService.requestTransaction({
      functionName,
      inputs,
      publicKey: wallet.publicKey,
      programId: PROGRAM_ID,
      fee: 1000000,
      chainId
    });
  };

  const normalizeField = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.endsWith('field') ? trimmed : `${trimmed}field`;
  };

  const handleCreateInvoice = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const microcredits = BigInt(Math.floor(parseFloat(amountCredits) * 1_000_000));
      const dueTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);
      const createdTimestamp = Math.floor(Date.now() / 1000);
      const invoiceHash = await generateInvoiceHash({
        invoiceNumber: `TEST-${Date.now()}`,
        lineItems: [
          {
            description,
            quantity: 1,
            unitPrice: Number(amountCredits),
            amount: Number(amountCredits)
          }
        ],
        subtotal: Number(amountCredits),
        taxRate: 0,
        taxAmount: 0,
        total: Number(amountCredits),
        currency: 'CREDITS'
      });

      const response = await requestTx([
        {
          program: PROGRAM_ID,
          functionName: 'create_invoice',
          inputs: [
            buyer.trim(),
            `${microcredits.toString()}u64`,
            invoiceHash,
            `${dueTimestamp}u32`,
            `${createdTimestamp}u32`
          ]
        }
      ]);

      setCreatedInvoiceHash(invoiceHash);
      setExpectedHash(normalizeField(invoiceHash));
      setMessage(`Create invoice submitted. TX: ${response?.transactionId ?? 'unknown'}`);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setMessage(formatError(error));
    }
  };

  const handleCancel = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const recordInput =
        invoiceRecordObject ||
        (await (async () => {
          if (!expectedHash.trim()) {
            throw new Error('Expected invoice hash is required');
          }
          const { rawRecord } = await scanInvoiceRecord(expectedHash.trim() as any, expectedHash.trim() as any);
          if (!rawRecord) {
            throw new Error('Invoice record not found on chain. Please wait for confirmation.');
          }
          setInvoiceRecordObject(rawRecord);
          return rawRecord;
        })());
      const response = await requestTx([
        {
          program: PROGRAM_ID,
          functionName: 'cancel_invoice',
          inputs: [recordInput]
        }
      ]);
      setMessage(`Cancel submitted. TX: ${response?.transactionId ?? 'unknown'}`);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setMessage(formatError(error));
    }
  };

  const handleMarkPaid = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const recordInput =
        invoiceRecordObject ||
        (await (async () => {
          if (!expectedHash.trim()) {
            throw new Error('Expected invoice hash is required');
          }
          const { rawRecord } = await scanInvoiceRecord(expectedHash.trim() as any, expectedHash.trim() as any);
          if (!rawRecord) {
            throw new Error('Invoice record not found on chain. Please wait for confirmation.');
          }
          setInvoiceRecordObject(rawRecord);
          return rawRecord;
        })());
      const response = await requestTx([
        {
          program: PROGRAM_ID,
          functionName: 'mark_as_paid',
          inputs: [recordInput, `${paidAt}u32`]
        }
      ]);
      setMessage(`Mark as paid submitted. TX: ${response?.transactionId ?? 'unknown'}`);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setMessage(formatError(error));
    }
  };

  const handleLoadInvoiceRecord = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const targetHash = expectedHash.trim();
      if (!targetHash) {
        throw new Error('Expected invoice hash is required to locate the record');
      }
      const { rawRecord } = await scanInvoiceRecord(targetHash as any, targetHash as any);
      if (!rawRecord) {
        throw new Error('Invoice record not found on chain. Please wait for confirmation.');
      }
      setInvoiceRecordObject(rawRecord);
      setMessage('Loaded invoice record from chain scan');
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setMessage(formatError(error));
    }
  };

  const hasInvoiceRecord = Boolean(invoiceRecordObject);
  const hashLooksValid = expectedHash.trim().endsWith('field');

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-primary-900">Contract Test Lab</h1>
        <p className="text-sm text-primary-600">
          Program: <span className="font-mono">{PROGRAM_ID}</span> | Credits: {CREDITS_PROGRAM_ID}
        </p>
        <p className="text-sm text-primary-600">
          Wallet: {wallet.publicKey || 'Not connected'}
        </p>
        {message && (
          <p
            className={`mt-3 text-sm ${
              status === 'error' ? 'text-red-600' : 'text-green-700'
            }`}
          >
            {message}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary-900">1) Create Invoice</h2>
        <p className="mt-2 text-xs text-primary-600">
          Step 1: Fill buyer + amount, then click Create. We will auto-fill the invoice hash for you.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Buyer address"
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Amount (credits)"
            value={amountCredits}
            onChange={(e) => setAmountCredits(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <button
          className="mt-4 rounded-lg bg-primary-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={handleCreateInvoice}
          disabled={!buyer.trim() || !amountCredits.trim()}
        >
          Create Invoice
        </button>
        {createdInvoiceHash && (
          <p className="mt-2 text-xs text-primary-600">
            Latest invoice hash: <span className="font-mono">{createdInvoiceHash}</span>
          </p>
        )}
      </section>

      <section className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary-900">2) Load Invoice Record</h2>
        <p className="mt-2 text-xs text-primary-600">
          Step 2: Load the invoice record from chain scan using the invoice hash below.
        </p>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
          {hasInvoiceRecord ? 'Invoice record loaded from chain scan.' : 'No invoice record loaded yet.'}
        </div>
        <input
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Expected invoice hash (field)"
          value={expectedHash}
          onChange={(e) => setExpectedHash(normalizeField(e.target.value))}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-primary-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={handleCancel}
            disabled={!hasInvoiceRecord}
          >
            Cancel Invoice
          </button>
          <button
            className="rounded-lg bg-primary-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={handleMarkPaid}
            disabled={!hasInvoiceRecord}
          >
            Mark as Paid
          </button>
          <button
            className="rounded-lg border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700"
            onClick={handleLoadInvoiceRecord}
            disabled={!hashLooksValid}
          >
            Load Invoice Record
          </button>
          {!hashLooksValid && (
            <span className="text-xs text-amber-600">
              Expected hash must end with <code>field</code> to auto-load.
            </span>
          )}
          {!hasInvoiceRecord && (
            <span className="text-xs text-amber-600">
              Load an invoice record before cancel/mark paid.
            </span>
          )}
        </div>
        <div className="mt-4">
          <label className="text-xs text-primary-500">Paid timestamp (u32)</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
      </section>

    </div>
  );
}
