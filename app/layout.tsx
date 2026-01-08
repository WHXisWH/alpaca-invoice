import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Providers from '@/components/providers';
import WalletWatcher from '@/components/wallet-watcher';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZK-Invoice | Aleo',
  description: 'Privacy-preserving invoice and payment system built on Aleo'
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-amber-50/30">
        <Providers>
          <WalletWatcher />

          {/* Header */}
          <header className="border-b border-amber-200 bg-white/90 backdrop-blur-sm sticky top-0 z-50">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-2">
                <div className="text-2xl">🧾</div>
                <span className="text-lg font-bold text-slate-900">ZK-Invoice</span>
              </Link>

              <div className="flex items-center gap-6">
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-slate-700 hover:text-amber-600 transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/invoices/create"
                  className="text-sm font-medium text-slate-700 hover:text-amber-600 transition-colors"
                >
                  Create
                </Link>
                <Link
                  href="/invoices"
                  className="text-sm font-medium text-slate-700 hover:text-amber-600 transition-colors"
                >
                  Invoices
                </Link>
                <Link
                  href="/receipts"
                  className="text-sm font-medium text-slate-700 hover:text-amber-600 transition-colors"
                >
                  Receipts
                </Link>
                <Link
                  href="/audit"
                  className="text-sm font-medium text-slate-700 hover:text-amber-600 transition-colors"
                >
                  Audit
                </Link>
              </div>
            </nav>
          </header>

          {/* Main Content */}
          <main className="mx-auto max-w-7xl px-6 py-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-amber-200 bg-white/90 mt-16">
            <div className="mx-auto max-w-7xl px-6 py-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span>Powered by</span>
                  <a
                    href="https://aleo.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-amber-600 hover:text-amber-700"
                  >
                    Aleo Network
                  </a>
                </div>
                <div className="flex items-center gap-6">
                  <a
                    href="https://github.com/your-repo/zk-invoice"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-amber-600 transition-colors"
                  >
                    GitHub
                  </a>
                  <a
                    href="/ALEO_DEPLOYMENT_GUIDE.md"
                    target="_blank"
                    className="hover:text-amber-600 transition-colors"
                  >
                    Documentation
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
