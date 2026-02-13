import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { createAuditService } from '@/services/AuditService/createAuditService';
import type {
  GenerateAuditPackageParams,
  GenerateAuditPackageResult
} from '@/services/AuditService/IAuditService';
import { AuditPackage } from '@/lib/audit';

/**
 * Audit Controller Hook
 * 
 * Responsibilities:
 * - Bridge React context (wallet, stores) to service layer
 * - Manage loading state for UI
 * - Use unified error handler for consistent error reporting
 * - Provide high-level controller methods for components
 * 
 * Pattern:
 * - Similar to wallet service pattern
 * - Uses factory function to create service with injected dependencies
 * - Uses unified error handler for consistent error reporting
 * - Reuses wallet service's signMessage (no duplication of encoding/decoding)
 */
export function useAuditController() {
  const { getAllInvoices } = useInvoiceStore.getState();
  const walletContext = useWallet();
  const { publicKey } = useUserStore();
  const { handleError } = useErrorHandler();

  // Loading state
  const [loading, setLoading] = useState(false);

  // Create wallet service adapter (reuse existing wallet adapter)
  const walletService = useMemo(
    () => createWalletAdapter(walletContext),
    [walletContext]
  );

  // Create audit service instance with injected dependencies
  // Note: masterKey is NOT passed; service will derive it internally using CryptoService
  const auditService = useMemo(
    () => createAuditService(walletService, publicKey, getAllInvoices),
    [walletService, publicKey, getAllInvoices]
  );

  /**
   * Generate audit package with loading and error handling
   */
  const generate = useCallback(
    async (params: GenerateAuditPackageParams): Promise<GenerateAuditPackageResult> => {
      setLoading(true);
      try {
        const result = await auditService.generate(params);
        return result;
      } catch (err: any) {
        handleError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [auditService, handleError]
  );

  /**
   * Validate audit package with loading and error handling
   */
  const validate = useCallback(
    async (pkg: AuditPackage, auditKey: string) => {
      setLoading(true);
      try {
        const result = await auditService.validate(pkg, auditKey);
        return result;
      } catch (err: any) {
        handleError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [auditService, handleError]
  );

  /**
   * Download audit package as JSON file
   */
  const downloadPackage = useCallback((pkg: AuditPackage, invoiceId: string) => {
    try {
      const blob = new Blob([JSON.stringify(pkg, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-package-${invoiceId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      handleError(err);
    }
  }, [handleError]);

  return {
    generate,
    validate,
    downloadPackage,
    loading
  };
}
