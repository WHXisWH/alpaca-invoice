import { useMemo } from 'react';

export function useCreateInvoicePage() {
  return useMemo(() => ({
    title: 'Create Invoice',
    description: 'Data is encrypted locally before on-chain commitment',
    mascotSrc: '/images/mascot/mascot-writing.png',
    mascotAlt: 'Creating invoice'
  }), []);
}
