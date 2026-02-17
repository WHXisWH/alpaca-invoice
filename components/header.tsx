'use client';

import { usePathname } from 'next/navigation';
import WalletConnectButtonV2 from '@/components/wallet-connect-button-v2';
import { Bell, Menu } from 'lucide-react';
import { useSidebar } from '@/components/sidebar-context';

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  '/': { title: 'Welcome', subtitle: 'Get started with Alpaca Invoice' },
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview of your invoice activity' },
  '/invoices': { title: 'Invoices', subtitle: 'Manage your sent and received invoices' },
  '/invoices/create': { title: 'Create Invoice', subtitle: 'Create a new privacy-preserving invoice' },
  '/receipts': { title: 'Receipts', subtitle: 'View your payment receipts' },
  '/audit': { title: 'Audit Center', subtitle: 'Generate and manage audit keys' },
  '/docs': { title: 'Documentation', subtitle: 'Guides, architecture, and workflows' },
  '/docs/architecture': { title: 'Architecture', subtitle: 'Technical architecture overview' },
  '/docs/business-flow': { title: 'Business Flow', subtitle: 'Business logic and workflows' },
  '/docs/handbook': { title: 'Handbook', subtitle: 'Quick start guide and FAQ' },
};

/** Resolve page info for both static and dynamic routes */
function resolvePageInfo(pathname: string): { title: string; subtitle?: string } {
  if (pageTitles[pathname]) return pageTitles[pathname];
  // Dynamic invoice detail route: /invoices/[hash]
  if (pathname.startsWith('/invoices/') && pathname !== '/invoices/create') {
    return { title: 'Invoice Detail', subtitle: 'View invoice details and status' };
  }
  return { title: 'Alpaca Invoice' };
}

export default function Header() {
  const pathname = usePathname();
  const pageInfo = resolvePageInfo(pathname);
  const { toggle } = useSidebar();

  return (
    <header className="sticky top-4 z-30 flex h-14 items-center justify-between rounded-2xl border border-white/60 bg-white/80 px-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl md:top-6 md:h-16 md:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger menu */}
        <button
          onClick={toggle}
          className="rounded-lg p-1.5 text-primary-500 transition-colors hover:bg-primary-100/70 hover:text-primary-700 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-primary-900">{pageInfo.title}</h1>
        {pageInfo.subtitle && (
          <p className="hidden text-sm text-primary-500 sm:block">{pageInfo.subtitle}</p>
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
