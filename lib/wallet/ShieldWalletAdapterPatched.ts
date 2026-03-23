import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { WalletConnectionError } from '@provablehq/aleo-wallet-adaptor-core';
import type { Network } from '@provablehq/aleo-types';
import { WalletDecryptPermission } from '@provablehq/aleo-wallet-standard';

/**
 * Shield adapter with timeout & fallback attempts to avoid无限 connecting。
 */
export class ShieldWalletAdapterPatched extends ShieldWalletAdapter {
  async connect(network?: Network, decryptPermission?: WalletDecryptPermission, programs?: string[]) {
    const timeoutMs = 8000;
    const start = Date.now();

    const attempt = async (
      label: string,
      net: Network | string | undefined,
      perm: WalletDecryptPermission | undefined,
      progs?: string[]
    ) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new WalletConnectionError(`Shield connect timeout after ${timeoutMs}ms [${label}]`));
        }, timeoutMs);
      });

      try {
        const res = await Promise.race([
          super.connect(net as Network, perm ?? WalletDecryptPermission.UponRequest, progs),
          timeoutPromise
        ]);

        console.log('[ShieldAdapterPatched] connect resolved', {
          attempt: label,
          durationMs: Date.now() - start,
          network: net,
          programs: progs,
          decryptPermission: perm
        });

        return res as Awaited<ReturnType<ShieldWalletAdapter['connect']>>;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const attempts = [
      { label: 'net-default+perm-default+programs', net: network, perm: decryptPermission, progs: programs },
      { label: 'net-default+perm-upon-request+programs', net: network, perm: WalletDecryptPermission.UponRequest, progs: programs },
      { label: 'net-testnet3+perm-default+programs', net: 'testnet3', perm: decryptPermission, progs: programs },
      { label: 'net-testnet3+perm-upon-request+programs', net: 'testnet3', perm: WalletDecryptPermission.UponRequest, progs: programs },
      { label: 'net-default+perm-upon-request+no-programs', net: network, perm: WalletDecryptPermission.UponRequest, progs: [] },
      { label: 'no-args', net: undefined, perm: WalletDecryptPermission.UponRequest, progs: undefined }
    ];

    let lastError: unknown;
    for (const a of attempts) {
      try {
        return await attempt(a.label, a.net, a.perm, a.progs);
      } catch (e) {
        lastError = e;
        console.warn('[ShieldAdapterPatched] connect attempt failed', { attempt: a.label, error: e });
      }
    }

    throw lastError;
  }

  /**
   * Shield extension may occasionally throw "Receiving end does not exist"
   * during disconnect (e.g. extension reloaded / background channel lost).
   * Treat it as already disconnected to avoid crashing the app UI.
   */
  async disconnect() {
    try {
      await super.disconnect();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error ?? '');
      const lower = msg.toLowerCase();
      const isMissingReceiver =
        lower.includes('receiving end does not exist') ||
        (lower.includes('could not establish connection') &&
          lower.includes('receiving end'));

      if (isMissingReceiver) {
        console.warn(
          '[ShieldAdapterPatched] disconnect ignored (extension channel missing):',
          msg
        );
        return;
      }

      throw error;
    }
  }
}

export default ShieldWalletAdapterPatched;
