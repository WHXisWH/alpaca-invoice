'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  FilePlus,
  Receipt,
  ShieldCheck,
  HelpCircle,
  TestTube2,
} from 'lucide-react';

const navItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Invoices',
    href: '/invoices',
    icon: FileText,
  },
  {
    title: 'Create Invoice',
    href: '/invoices/create',
    icon: FilePlus,
  },
  {
    title: 'Receipts',
    href: '/receipts',
    icon: Receipt,
  },
  {
    title: 'Audit Center',
    href: '/audit',
    icon: ShieldCheck,
  },
  {
    title: 'Contract Test',
    href: '/contract-test',
    icon: TestTube2,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-primary-900">
      <div className="flex h-full flex-col">
        {/* Logo - Click to go to homepage */}
        <Link
          href="/"
          className="flex h-16 items-center gap-3 border-b border-primary-800 px-6 transition-colors hover:bg-primary-800"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500">
            <span className="text-xl">🦙</span>
          </div>
          <div>
            <span className="text-lg font-bold text-white">Alpaca</span>
            <span className="text-lg font-light text-primary-400"> Invoice</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-6">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-primary-500">
            Menu
          </div>
          {navItems.map((item) => {
            // Exact match only - no startsWith to avoid parent routes being highlighted
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/25'
                    : 'text-primary-300 hover:bg-primary-800 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        {/* Help Card */}
        <div className="p-4">
          <div className="rounded-xl bg-primary-800 p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500/20">
                <HelpCircle className="h-5 w-5 text-accent-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Need Help?</p>
                <p className="text-xs text-primary-400">Check our docs</p>
              </div>
            </div>
            <Link
              href="/docs"
              className="block w-full rounded-lg bg-primary-700 py-2 text-center text-xs font-medium text-primary-200 transition-colors hover:bg-primary-600 hover:text-white"
            >
              Documentation
            </Link>
          </div>
        </div>

        {/* Footer with mascot */}
        <div className="border-t border-primary-800 p-4">
          <div className="flex items-center gap-3">
            <Image
              src="/images/mascot/mascot-happy.png"
              alt="Paca"
              width={36}
              height={36}
              className="rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-white">Paca</p>
              <p className="text-xs text-primary-400">Your invoice assistant</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
