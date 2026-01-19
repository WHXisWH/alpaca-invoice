import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Providers from '@/components/providers';
import WalletWatcher from '@/components/wallet-watcher';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import { ErrorHandler } from '@/components/error-handler';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Alpaca Invoice',
  description: 'Privacy-preserving invoice and payment system built on Aleo',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-primary-50">
        <Providers>
          <WalletWatcher />
          <ErrorHandler />
          <Toaster
            position="top-right"
            richColors
            toastOptions={{
              classNames: {
                toast: 'bg-white border border-primary-200 shadow-lg rounded-xl',
                title: 'text-primary-900 font-semibold',
                description: 'text-primary-600',
              },
            }}
          />

          {/* Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <div className="pl-64">
            {/* Header */}
            <Header />

            {/* Page Content */}
            <main className="min-h-[calc(100vh-4rem)] p-6">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
