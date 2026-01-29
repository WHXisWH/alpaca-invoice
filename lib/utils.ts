import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Clean Aleo-formatted number strings (remove type suffixes such as u64, u8, etc.)
 *
 * @param value - Aleo-formatted number string or other value
 * @returns Cleaned number string
 *
 * @example
 * cleanAleoNumber("1000000u64") // "1000000"
 * cleanAleoNumber("0u8") // "0"
 * cleanAleoNumber("123456789u128") // "123456789"
 * cleanAleoNumber(123) // "123"
 */
export function cleanAleoNumber(value: any): string {
  if (typeof value === 'string') {
    // Remove Aleo type suffixes: u8, u16, u32, u64, u128, i8, i16, i32, i64, i128
    return value.replace(/(u8|u16|u32|u64|u128|i8|i16|i32|i64|i128)$/i, '');
  }
  return String(value);
}
