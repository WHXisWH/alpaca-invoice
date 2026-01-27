'use client';

import { usePathname } from 'next/navigation';
import WalletConnectButtonV2 from '@/components/wallet-connect-button-v2';
import { Bell } from 'lucide-react';

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  '/': { title: 'Welcome', subtitle: 'Get started with Alpaca Invoice' },
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview of your invoice activity' },
  '/invoices': { title: 'Invoices', subtitle: 'Manage your sent and received invoices' },
  '/invoices/create': { title: 'Create Invoice', subtitle: 'Create a new privacy-preserving invoice' },
  '/receipts': { title: 'Receipts', subtitle: 'View your payment receipts' },
  '/audit': { title: 'Audit Center', subtitle: 'Generate and manage audit keys' },
};

export default function Header() {
  const pathname = usePathname();
  const pageInfo = pageTitles[pathname] || { title: 'Alpaca Invoice' };

  return (
    <header className="sticky top-6 z-30 flex h-16 items-center justify-between rounded-2xl border border-white/60 bg-white/80 px-6 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div>
        <h1 className="text-lg font-semibold text-primary-900">{pageInfo.title}</h1>
        {pageInfo.subtitle && (
          <p className="text-sm text-primary-500">{pageInfo.subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications (placeholder) */}
        <button className="relative cursor-pointer rounded-lg p-2 text-primary-500 transition-colors hover:bg-primary-100/70 hover:text-primary-700">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-500" />
        </button>

        {/* Wallet */}
        <WalletConnectButtonV2 />
      </div>
    </header>
  );
}
