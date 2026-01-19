'use client';

import { cn } from '@/lib/utils';
import { Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { InvoiceStatus } from '@/lib/types';

interface StatusBadgeProps {
  status: InvoiceStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const statusConfig = {
  [InvoiceStatus.PENDING]: {
    icon: Clock,
    label: 'Pending',
    className: 'bg-warning-50 text-warning-700 border-warning-200',
  },
  [InvoiceStatus.PAID]: {
    icon: CheckCircle,
    label: 'Paid',
    className: 'bg-success-50 text-success-700 border-success-200',
  },
  [InvoiceStatus.CANCELLED]: {
    icon: XCircle,
    label: 'Cancelled',
    className: 'bg-primary-100 text-primary-600 border-primary-200',
  },
  [InvoiceStatus.EXPIRED]: {
    icon: AlertTriangle,
    label: 'Expired',
    className: 'bg-error-50 text-error-700 border-error-200',
  },
};

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        config.className,
        className
      )}
    >
      <Icon className={cn(size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      {config.label}
    </span>
  );
}

// Export config for use in other components
export function getStatusConfig(status: InvoiceStatus) {
  return statusConfig[status];
}
