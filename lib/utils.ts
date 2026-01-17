import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 清理 Aleo 格式的数字字符串（移除类型后缀如 u64, u8 等）
 * 
 * @param value - Aleo 格式的数字字符串或其他值
 * @returns 清理后的数字字符串
 * 
 * @example
 * cleanAleoNumber("1000000u64") // "1000000"
 * cleanAleoNumber("0u8") // "0"
 * cleanAleoNumber("123456789u128") // "123456789"
 * cleanAleoNumber(123) // "123"
 */
export function cleanAleoNumber(value: any): string {
  if (typeof value === 'string') {
    // 移除 Aleo 类型后缀：u8, u16, u32, u64, u128, i8, i16, i32, i64, i128
    return value.replace(/(u8|u16|u32|u64|u128|i8|i16|i32|i64|i128)$/i, '');
  }
  return String(value);
}
