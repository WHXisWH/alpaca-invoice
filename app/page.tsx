import Link from 'next/link';
import WalletConnectButton from '@/components/wallet-connect-button';

export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="rounded-2xl bg-gradient-to-br from-amber-50 to-white border border-amber-200 p-8 shadow-sm">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-slate-900">
            ZK-Invoice
          </h1>
          <p className="mt-3 text-base text-slate-700">
            Privacy-preserving invoice and payment system. Built on Aleo zero-knowledge proofs, protecting business confidentiality with audit support.
          </p>
          <div className="mt-6">
            <WalletConnectButton />
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/dashboard"
          className="group rounded-xl bg-white border-2 border-amber-200 p-6 hover:border-amber-400 transition-colors"
        >
          <div className="text-2xl mb-3">📊</div>
          <h3 className="font-semibold text-slate-900 mb-2">Dashboard</h3>
          <p className="text-sm text-slate-600">View all invoices and receipts</p>
        </Link>

        <Link
          href="/invoices/create"
          className="group rounded-xl bg-white border-2 border-amber-200 p-6 hover:border-amber-400 transition-colors"
        >
          <div className="text-2xl mb-3">✏️</div>
          <h3 className="font-semibold text-slate-900 mb-2">Create Invoice</h3>
          <p className="text-sm text-slate-600">Issue a new invoice</p>
        </Link>

        <Link
          href="/invoices"
          className="group rounded-xl bg-white border-2 border-amber-200 p-6 hover:border-amber-400 transition-colors"
        >
          <div className="text-2xl mb-3">📝</div>
          <h3 className="font-semibold text-slate-900 mb-2">Invoices</h3>
          <p className="text-sm text-slate-600">Manage all invoices</p>
        </Link>

        <Link
          href="/receipts"
          className="group rounded-xl bg-white border-2 border-amber-200 p-6 hover:border-amber-400 transition-colors"
        >
          <div className="text-2xl mb-3">🧾</div>
          <h3 className="font-semibold text-slate-900 mb-2">Receipts</h3>
          <p className="text-sm text-slate-600">View payment receipts</p>
        </Link>
      </section>

      {/* How it Works */}
      <section className="rounded-2xl bg-white border border-amber-200 p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-6">How It Works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
                1
              </div>
              <h3 className="font-semibold text-slate-900">Seller Issues</h3>
            </div>
            <p className="text-sm text-slate-600 ml-11">
              Enter buyer address, amount, and due date to create invoice. Both parties receive an InvoiceRecord.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
                2
              </div>
              <h3 className="font-semibold text-slate-900">Buyer Pays</h3>
            </div>
            <p className="text-sm text-slate-600 ml-11">
              After verification, buyer transfers Aleo Credits privately, then marks as paid.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
                3
              </div>
              <h3 className="font-semibold text-slate-900">Get Receipt</h3>
            </div>
            <p className="text-sm text-slate-600 ml-11">
              Both parties receive PaymentRecord as proof of payment for reconciliation and auditing.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="rounded-2xl bg-amber-50 border border-amber-200 p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Key Features</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex gap-3">
            <div className="text-xl">🔒</div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Complete Privacy</h3>
              <p className="text-xs text-slate-600 mt-1">
                Transaction amounts and party details visible only to holders
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="text-xl">⚡</div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Instant Confirmation</h3>
              <p className="text-xs text-slate-600 mt-1">
                Built on Aleo blockchain with second-level transaction finality
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="text-xl">💰</div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Low Fees</h3>
              <p className="text-xs text-slate-600 mt-1">
                On-chain transaction costs far below traditional cross-border transfers
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="text-xl">✅</div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Verifiable</h3>
              <p className="text-xs text-slate-600 mt-1">
                Invoice hash and payment receipts can be independently verified
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="text-xl">🔍</div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Audit Support</h3>
              <p className="text-xs text-slate-600 mt-1">
                Selective disclosure to auditors via View Key
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="text-xl">📱</div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Easy to Use</h3>
              <p className="text-xs text-slate-600 mt-1">
                Connect your Aleo wallet to get started
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contract Info */}
      <section className="rounded-2xl bg-white border border-amber-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Contract Information</h2>
        <div className="grid gap-3 text-sm">
          <div className="flex justify-between py-2 border-b border-amber-100">
            <span className="text-slate-600">Program ID</span>
            <code className="text-xs bg-amber-50 px-2 py-1 rounded text-slate-900">
              zk_invoice.aleo
            </code>
          </div>
          <div className="flex justify-between py-2 border-b border-amber-100">
            <span className="text-slate-600">Network</span>
            <span className="font-medium text-slate-900">Aleo Testnet</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-600">Status</span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500"></span>
              <span className="font-medium text-green-700">Deployed</span>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
