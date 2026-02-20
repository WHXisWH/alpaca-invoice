export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  route: string;
  /** If true, the user must perform this action before advancing */
  waitForAction?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'wallet',
    target: '[data-tour="wallet-connect"]',
    title: 'Step 1 — Connect Wallet',
    description:
      'Click this button to connect your Aleo wallet. This is the first step to use Alpaca Invoice.',
    placement: 'bottom',
    route: '/dashboard',
    waitForAction: true,
  },
  {
    id: 'dashboard',
    target: '[data-tour="dashboard-stats"]',
    title: 'Step 2 — Quick Actions',
    description:
      'This is your Quick Actions panel. You can create invoices, check pending items, view receipts, or jump to the Audit Center.',
    placement: 'bottom',
    route: '/dashboard',
  },
  {
    id: 'create',
    target: '[data-tour="invoice-form"]',
    title: 'Step 3 — Create Invoice',
    description:
      'Fill in the buyer address, add line items and a due date, then submit. The data is encrypted locally before the on-chain commitment.',
    placement: 'bottom',
    route: '/invoices/create',
  },
  {
    id: 'invoices',
    target: '[data-tour="invoice-list"]',
    title: 'Step 4 — Invoice List',
    description:
      'All your invoices are here. Filter by status or role, sync on-chain data, export CSV, and click any card for details — pay, cancel, or generate audit packages.',
    placement: 'bottom',
    route: '/invoices',
  },
  {
    id: 'audit',
    target: '[data-tour="audit-center"]',
    title: 'Step 5 — Audit & Verify',
    description:
      'Generate a ZK audit package with selective disclosure, then use the Verify page to let auditors check data integrity without seeing private details.',
    placement: 'top',
    route: '/audit',
  },
];
