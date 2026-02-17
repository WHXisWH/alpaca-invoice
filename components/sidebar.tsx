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
  BookOpen,
  HelpCircle,
  X,
} from 'lucide-react';
import { useSidebar } from '@/components/sidebar-context';

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
    title: 'Documentation',
    href: '/docs',
    icon: BookOpen,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 border-r border-white/5 bg-gradient-to-b from-primary-950 via-primary-900 to-primary-950 transition-transform duration-300 ease-in-out',
          // Desktop: always visible; Mobile: slide in/out
          'md:z-40 md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo - Click to go to homepage */}
          <Link
            href="/"
            className="flex h-16 items-center gap-3 border-b border-white/5 px-6 transition-colors hover:bg-white/5 cursor-pointer"
          >
            {/* Mobile close button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                close();
              }}
              className="absolute right-3 top-4 rounded-lg p-1 text-primary-400 hover:text-white md:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
            <Image
              src="/images/mascot/mascot-shield.png"
              alt="Alpaca logo"
              width={28}
              height={28}
              className="object-contain"
            />
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
            // Prefix match for sections with dynamic sub-pages; exact match for the rest
            const isActive = (() => {
              if (item.href === '/invoices') {
                return pathname === '/invoices' ||
                  (pathname.startsWith('/invoices/') && pathname !== '/invoices/create');
              }
              if (item.href === '/docs') return pathname.startsWith('/docs');
              return pathname === item.href;
            })();
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all cursor-pointer',
                  isActive
                    ? 'bg-gradient-to-r from-accent-500/90 to-accent-400/80 text-white shadow-lg shadow-accent-500/25'
                    : 'text-primary-300 hover:bg-white/5 hover:text-white'
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
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_12px_24px_-16px_rgba(15,23,42,0.5)] backdrop-blur">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500/15 ring-1 ring-accent-500/20">
                <HelpCircle className="h-5 w-5 text-accent-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Need Help?</p>
                <p className="text-xs text-primary-400">Check our docs</p>
              </div>
            </div>
            <Link
              href="/docs"
              className="block w-full cursor-pointer rounded-lg bg-white/10 py-2 text-center text-xs font-medium text-primary-200 transition-colors hover:bg-white/20 hover:text-white"
            >
              Documentation
            </Link>
          </div>
        </div>

        {/* Footer with mascot */}
        <div className="border-t border-white/5 p-4">
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
    </>
  );
}
