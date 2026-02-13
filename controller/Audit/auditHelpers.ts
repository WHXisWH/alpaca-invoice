/**
 * Pure helpers for audit package generation.
 * Used by useAuditController.
 */

import { FIELD_SCOPE_IDS } from './auditConstants';

export const toSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

export const sumLineItems = (
  lineItems: { quantity: number; unitPrice: number }[]
): number =>
  lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);

export function buildScopesBitmask(fields: string[]): bigint {
  let mask = 0n;
  for (const f of fields) {
    const id = FIELD_SCOPE_IDS[f];
    if (id) {
      mask |= 1n << BigInt(id - 1);
    }
  }
  return mask;
}
