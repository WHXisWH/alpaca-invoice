import { useCallback, useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import {
  AuditPackage,
  createAuditPackage,
  randomAuditKey,
  validateAuditPackage
} from '@/lib/audit';
import type { AleoAddress, AleoField } from '@/lib/types';

const cryptoService = new CryptoService();

export function useAuditController() {
  const { getAllInvoices } = useInvoiceStore.getState();
  const walletContext = useWallet();
  const { publicKey, masterKey } = useUserStore();

  const signerAddress = useMemo(() => publicKey as AleoAddress | null, [publicKey]);

  const generate = useCallback(
    async (options: {
      invoiceId: AleoField;
      auditorAddress: AleoAddress;
      expiresAt: number;
      permissions: string[];
    }): Promise<{ pkg: AuditPackage; auditKey: string }> => {
      if (!signerAddress) throw new Error('Wallet not connected');
      if (!masterKey) throw new Error('Master key missing. Please sign to derive it.');

      const invoices = await getAllInvoices({ masterKey, refreshMemory: false });
      const invoice =
        invoices.find((inv) => inv.id === options.invoiceId) ||
        invoices.find((inv) => inv.invoiceHash === options.invoiceId);

      if (!invoice) {
        throw new Error('Invoice not found in local storage. Please sync invoices first.');
      }
      if (!invoice.details) {
        throw new Error('Invoice details are missing; cannot generate audit package.');
      }

      const auditKey = randomAuditKey();
      const signMessage = async (message: string) => {
        if (!walletContext.signMessage) {
          throw new Error('Wallet does not support signMessage');
        }
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const sigBytes = await walletContext.signMessage(encoder.encode(message));
        return decoder.decode(sigBytes);
      };

      const { pkg } = await createAuditPackage({
        invoice,
        permissions: options.permissions,
        auditorAddress: options.auditorAddress,
        expiresAt: options.expiresAt,
        signerAddress,
        auditKey,
        signMessage
      });

      return { pkg, auditKey };
    },
    [getAllInvoices, masterKey, signerAddress]
  );

  const validate = useCallback(
    async (pkg: AuditPackage, auditKey: string) => {
      return validateAuditPackage({
        pkg,
        auditKey,
        computeInvoiceHash: (details) => cryptoService.computeInvoiceHash(details)
      });
    },
    []
  );

  return { generate, validate };
}
