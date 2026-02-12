// Centralized contract identifiers for runtime use (frontend only).
// Fallbacks keep legacy ID for historical queries if env is missing.
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID ?? 'zk_invoice_v2_2.aleo';
export const LEGACY_PROGRAM_ID = process.env.NEXT_PUBLIC_LEGACY_PROGRAM_ID ?? 'zk_invoice.aleo';
export const CREDITS_PROGRAM_ID = 'credits.aleo';
