'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Wallet,
  FilePlus,
  CreditCard,
  Receipt,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Globe,
  Lock,
  Monitor,
} from 'lucide-react';

const steps = [
  {
    icon: Wallet,
    title: '1. Connect Your Wallet',
    description:
      'Install the Leo Wallet or Puzzle Wallet browser extension. Click "Connect Wallet" in the top-right corner and approve the connection request.',
  },
  {
    icon: FilePlus,
    title: '2. Create an Invoice',
    description:
      'Navigate to "Create Invoice" from the sidebar. Fill in the buyer\'s Aleo address, amount in credits, description, and due date, then submit. A zero-knowledge proof will be generated automatically.',
  },
  {
    icon: CreditCard,
    title: '3. Pay an Invoice',
    description:
      'Open a received invoice from the "Invoices" page. Review details and click "Pay". The app submits mark_as_paid with paid_at timestamp on zk_invoice_v2_2.aleo.',
  },
  {
    icon: ShieldCheck,
    title: '4. Generate Audit Package',
    description:
      'Go to "/audit" → choose your invoice → pick fields (scopes), set expiry. The package contains rules_hash, commitments_root, field commitments, scopes bitmask, and program_id.',
  },
  {
    icon: Receipt,
    title: '5. Verify Package',
    description:
      'Paste the package JSON + audit key in the validator. The app recomputes rules, checks on-chain anchors (commitment/rules/auth/counter) and shows R1–R5 results.',
  },
];

const faqs = [
  {
    icon: Lock,
    question: 'How is my data kept private?',
    answer:
      'All invoice data is encrypted client-side using AES-GCM with a master key derived from your wallet signature. On-chain records use Aleo\'s zero-knowledge proofs, so transaction details are never publicly visible.',
  },
  {
    icon: Globe,
    question: 'Which network does this run on?',
    answer:
      'Aleo Testnet only. Current program: zk_invoice_v2_2.aleo (tx at13cmxw90rn5xux4gj7xejyz7jlc5yc7ugkjl8hv7rdgqp4l7uwcfq87ps78). Testnet credits have no real monetary value.',
  },
  {
    icon: Monitor,
    question: 'Which browsers are supported?',
    answer:
      'Any modern browser that supports the Leo Wallet or Puzzle Wallet extension. Chrome and Brave are recommended for the best experience.',
  },
  {
    icon: Wallet,
    question: 'Which wallets are supported?',
    answer:
      'Leo Wallet and Puzzle Wallet are both supported. Make sure your wallet extension is installed and connected to the Aleo Testnet.',
  },
  {
    icon: AlertTriangle,
    question: 'What happens if payment marking fails?',
    answer:
      'The payment uses a two-step process. If the credit transfer succeeds but the status update fails, your credits have already been transferred. You can retry the marking step or contact the seller for manual resolution.',
  },
  {
    icon: HelpCircle,
    question: 'Can I cancel an invoice after it is paid?',
    answer:
      'No. Once an invoice is marked as paid on-chain, it is a final state and cannot be reversed. Only pending invoices can be cancelled, and only by the seller.',
  },
];

export default function HandbookPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/docs"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary-200 bg-white/80 text-primary-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-primary-900">Handbook</h1>
      </div>

      {/* Quick Start Guide */}
      <div className="surface-card p-6 md:p-8">
        <h2 className="mb-1 text-lg font-semibold text-primary-900">Quick Start Guide</h2>
        <p className="mb-6 text-sm text-primary-500">
          Follow these steps to start using Alpaca Invoice
        </p>

        <div className="space-y-5">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-100">
                  <Icon className="h-5 w-5 text-accent-600" />
                </div>
                <div>
                  <h3 className="mb-1 font-semibold text-primary-800">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-primary-500">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Important Notes & FAQ */}
      <div className="surface-card p-6 md:p-8">
        <h2 className="mb-1 text-lg font-semibold text-primary-900">Important Notes & FAQ</h2>
        <p className="mb-6 text-sm text-primary-500">
          Common questions and things to keep in mind
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {faqs.map((faq) => {
            const Icon = faq.icon;
            return (
              <div
                key={faq.question}
                className="rounded-xl border border-primary-200/60 bg-primary-50/50 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary-500" />
                  <h3 className="text-sm font-semibold text-primary-800">{faq.question}</h3>
                </div>
                <p className="text-sm leading-relaxed text-primary-500">{faq.answer}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
