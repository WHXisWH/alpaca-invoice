import type { ReactNode } from 'react';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import { InvoiceAutoPoller } from '@/components/InvoiceAutoPoller';
import { SidebarProvider } from '@/components/sidebar-context';

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      {/* ✅ 全局自动轮询组件：监听 SENDING 发票并自动启动轮询 */}
      <InvoiceAutoPoller />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="pl-0 md:pl-64">
        <div className="px-4 pt-4 md:px-6 md:pt-6">
          {/* Header */}
          <Header />

          {/* Page Content */}
          <main className="mt-4 min-h-[calc(100vh-7.5rem)] md:mt-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
