import type { ReactNode } from 'react';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="pl-64">
        <div className="px-6 pt-6">
          {/* Header */}
          <Header />

          {/* Page Content */}
          <main className="mt-6 min-h-[calc(100vh-7.5rem)]">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}
