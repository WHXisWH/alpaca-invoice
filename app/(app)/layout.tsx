import type { ReactNode } from 'react';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import { InvoiceAutoPoller } from '@/components/InvoiceAutoPoller';

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {/* ✅ 全局自动轮询组件：监听 SENDING 发票并自动启动轮询 */}
      <InvoiceAutoPoller />
      
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
