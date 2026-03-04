// Centralized contract identifiers for runtime use (frontend only).
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'zk_invoice_v3_1.aleo';
export const LEGACY_PROGRAM_ID = process.env.NEXT_PUBLIC_LEGACY_PROGRAM_ID ?? 'zk_invoice_v3_0.aleo';
export const CREDITS_PROGRAM_ID = 'credits.aleo';

/** USDCx (Aleo Testnet); set via env when integrating. See https://aleo.org/usdcx */
export const USDCX_PROGRAM_ID = process.env.NEXT_PUBLIC_USDCX_PROGRAM_ID ?? '';

/** Aleo field literal for zero (non-JCT / unused) */
export const ZERO_FIELD = '0field' as const;

/** Wave 3 mapping names for zk_invoice_v3_1.aleo */
export const MAPPINGS = {
  invoice_status: 'invoice_status',
  invoice_registry: 'invoice_registry',
  invoice_tax_tag: 'invoice_tax_tag',
  invoice_jct_reg: 'invoice_jct_reg',
  payment_commitments: 'payment_commitments'
} as const;
