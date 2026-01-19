'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  FileText,
  Clock,
  CheckCircle,
  Receipt,
  FilePlus,
  Lock,
  Zap,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-800 to-primary-900 p-8 text-white">
        <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/3 -translate-y-1/3 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-48 w-48 -translate-x-1/2 translate-y-1/2 rounded-full bg-accent-500/10 blur-2xl" />

        <div className="relative flex items-center justify-between">
          <div className="max-w-lg">
            <h1 className="text-3xl font-bold">
              Welcome to Alpaca Invoice
            </h1>
            <p className="mt-3 text-primary-200">
              Privacy-preserving invoicing powered by zero-knowledge proofs.
              Create, send, and receive payments on Aleo blockchain.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                href="/invoices/create"
                className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition-all hover:bg-accent-600 hover:shadow-xl"
              >
                <FilePlus className="h-4 w-4" />
                Create Invoice
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                View Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="hidden lg:block">
            <Image
              src="/images/mascot/mascot-hero-waving.png"
              alt="Paca mascot"
              width={200}
              height={200}
              priority
              className="drop-shadow-2xl"
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-info-100">
              <FileText className="h-6 w-6 text-info-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-900">0</p>
              <p className="text-sm text-primary-500">Total Invoices</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-100">
              <Clock className="h-6 w-6 text-warning-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-900">0</p>
              <p className="text-sm text-primary-500">Pending</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-100">
              <CheckCircle className="h-6 w-6 text-success-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-900">0</p>
              <p className="text-sm text-primary-500">Paid</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100">
              <Receipt className="h-6 w-6 text-accent-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-900">0</p>
              <p className="text-sm text-primary-500">Receipts</p>
            </div>
          </div>
        </div>
      </div>

      {/* How it Works */}
      <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary-900">How It Works</h2>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-100">
              <Image
                src="/images/flow/flow-step1-create.svg"
                alt="Create"
                width={40}
                height={40}
              />
            </div>
            <h3 className="mt-4 font-semibold text-primary-900">1. Create Invoice</h3>
            <p className="mt-2 text-sm text-primary-500">
              Enter buyer address, amount, and due date. Data is encrypted locally.
            </p>
          </div>

          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-100">
              <Image
                src="/images/flow/flow-step2-pay.svg"
                alt="Pay"
                width={40}
                height={40}
              />
            </div>
            <h3 className="mt-4 font-semibold text-primary-900">2. Pay Invoice</h3>
            <p className="mt-2 text-sm text-primary-500">
              Buyer verifies and transfers Aleo Credits privately on-chain.
            </p>
          </div>

          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-100">
              <Image
                src="/images/flow/flow-step3-receipt.svg"
                alt="Receipt"
                width={40}
                height={40}
              />
            </div>
            <h3 className="mt-4 font-semibold text-primary-900">3. Get Receipt</h3>
            <p className="mt-2 text-sm text-primary-500">
              Both parties receive cryptographic proof for auditing.
            </p>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
            <Lock className="h-6 w-6 text-primary-600" />
          </div>
          <h3 className="mt-4 font-semibold text-primary-900">Privacy First</h3>
          <p className="mt-2 text-sm text-primary-500">
            Transaction details visible only to involved parties using zero-knowledge proofs.
          </p>
        </div>

        <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
            <ShieldCheck className="h-6 w-6 text-primary-600" />
          </div>
          <h3 className="mt-4 font-semibold text-primary-900">Verifiable</h3>
          <p className="mt-2 text-sm text-primary-500">
            On-chain proofs for payment verification without revealing amounts.
          </p>
        </div>

        <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
            <Zap className="h-6 w-6 text-primary-600" />
          </div>
          <h3 className="mt-4 font-semibold text-primary-900">Fast & Low Cost</h3>
          <p className="mt-2 text-sm text-primary-500">
            Built on Aleo blockchain with minimal transaction fees.
          </p>
        </div>
      </div>

      {/* Contract Info */}
      <div className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary-900">Contract Info</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between border-b border-primary-100 pb-3">
            <span className="text-sm text-primary-500">Program ID</span>
            <code className="rounded-lg bg-primary-100 px-3 py-1 font-mono text-sm text-primary-700">
              zk_invoice.aleo
            </code>
          </div>
          <div className="flex items-center justify-between border-b border-primary-100 pb-3">
            <span className="text-sm text-primary-500">Network</span>
            <span className="text-sm font-medium text-primary-700">Aleo Testnet</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-primary-500">Status</span>
            <span className="inline-flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-500" />
              </span>
              <span className="text-sm font-medium text-success-600">Deployed</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
