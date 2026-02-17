/**
 * Commitment utilities using Aleo BHP hash (via @provablehq/sdk).
 * Matches zk_invoice_v2_2.aleo contract:
 * - commit_field(val, salt, tag) = BHP256::hash_to_field(FieldCommitInput { val, salt, tag })
 * - commitment_root = BHP256::hash_to_field(commitments)
 */

import { BHP768, Field, Address, Poseidon8 } from '@provablehq/sdk';
import type { AleoField } from '@/lib/types';

/** Field bit size in Aleo (toBitsLe returns 256 bits for canonical representation) */
const FIELD_BITS = 256;

/**
 * Contract-aligned field order for commitment root. Matches main.leo FieldCommitments struct.
 */
export const COMMITMENT_FIELD_ORDER = [
  'amount',
  'tax_amount',
  'due_date',
  'buyer',
  'seller',
  'currency',
  'items_hash',
  'memo_hash',
  'order_id'
] as const;

export type CommitmentFieldKey = (typeof COMMITMENT_FIELD_ORDER)[number];

/**
 * Convert string (field or address) to Field for hashing.
 * Addresses (aleo1...) are converted via Address.to_field().
 */
function toField(value: string): Field {
  if (value.startsWith('aleo1')) {
    const addr = Address.from_string(value);
    const fields = addr.toFields();
    return fields[0];
  }
  return Field.fromString(value.endsWith('field') ? value : `${value}field`);
}

/**
 * Convert AleoField/address string to little-endian bits for BHP hashing.
 * Uses Provable SDK Field.toBitsLe() for canonical Aleo serialization.
 */
function fieldToBits(value: string): boolean[] {
  const f = toField(value);
  return f.toBitsLe();
}

/**
 * Pad bits to target length (for BHP chunk alignment).
 * Aleo fields may be 254 bits; BHP768 needs 768, BHP1024 needs 1024.
 */
function padBits(bits: boolean[], length: number): boolean[] {
  if (bits.length >= length) return bits.slice(0, length);
  return [...bits, ...new Array(length - bits.length).fill(false)];
}

/**
 * Compute commit_field(val, salt, tag) matching Leo:
 *   let input = FieldCommitInput { val, salt, tag };
 *   return BHP256::hash_to_field(input);
 *
 * FieldCommitInput has 3 fields → 3×256 = 768 bits → BHP768.
 */
export function commitField(val: AleoField | string, salt: AleoField, tag: AleoField): AleoField {
  const valBits = fieldToBits(typeof val === 'string' ? val : String(val));
  const saltBits = fieldToBits(salt);
  const tagBits = fieldToBits(tag);
  const bits = [
    ...padBits(valBits, FIELD_BITS),
    ...padBits(saltBits, FIELD_BITS),
    ...padBits(tagBits, FIELD_BITS)
  ];
  const bhp = new BHP768();
  const result = bhp.hash(bits);
  const s = result.toString();
  return (s.endsWith('field') ? s : `${s}field`) as AleoField;
}

/**
 * Compute commitment root from FieldCommitments struct.
 * Contract uses BHP256::hash_to_field(commitments); SDK BHP accepts fixed input sizes.
 * We use Poseidon8 to hash the 9 commitment fields for a deterministic root.
 * For exact chain match, fetch root via get_invoice_commitment.
 */
export function computeCommitmentRoot(fields: Record<string, AleoField>): AleoField {
  const fieldArr: Field[] = [];
  for (const key of COMMITMENT_FIELD_ORDER) {
    const v = fields[key];
    if (v !== undefined) {
      fieldArr.push(toField(v));
    }
  }
  const hasher = new Poseidon8();
  const result = hasher.hash(fieldArr);
  return `${result.toString()}field` as AleoField;
}
