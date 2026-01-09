'use client';

import type {
  AuditKey,
  AuditKeyConfig,
  EncryptedPayload,
  InvoiceDetails
} from './types';
import { Buffer } from 'buffer';

function getWebCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined') {
    return globalThis.crypto as Crypto;
  }
  throw new Error('WebCrypto not available in this environment');
}

function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(input: string): Uint8Array {
  return new Uint8Array(Buffer.from(input, 'base64'));
}

export async function encryptInvoiceDetails(
  details: InvoiceDetails,
  encryptionKey: Uint8Array
): Promise<EncryptedPayload> {
  const cryptoImpl = getWebCrypto();
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(details));
  const key = await cryptoImpl.subtle.importKey(
    'raw',
    encryptionKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource
  );
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

export async function decryptInvoiceDetails(
  payload: EncryptedPayload,
  encryptionKey: Uint8Array
): Promise<InvoiceDetails> {
  const cryptoImpl = getWebCrypto();
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const key = await cryptoImpl.subtle.importKey(
    'raw',
    encryptionKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const plaintext = await cryptoImpl.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as InvoiceDetails;
}

export async function generateInvoiceHash(details: InvoiceDetails): Promise<string> {
  const cryptoImpl = getWebCrypto();
  const canonical = JSON.stringify(details, Object.keys(details).sort());
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await cryptoImpl.subtle.digest('SHA-256', data);
  const hex = Buffer.from(hashBuffer).toString('hex');
  const decimal = BigInt('0x' + hex).toString();
  return `${decimal}field`;
}

export function randomField(): string {
  const cryptoImpl = getWebCrypto();
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
  const hex = Buffer.from(bytes).toString('hex');
  const decimal = BigInt('0x' + hex).toString();
  return `${decimal}field`;
}

export function randomTransactionId(): `at1${string}` {
  const cryptoImpl = getWebCrypto();
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(18));
  return `at1${Buffer.from(bytes).toString('hex')}`;
}

export async function generateAuditKey(
  config: AuditKeyConfig,
  viewKey: string
): Promise<AuditKey> {
  const cryptoImpl = getWebCrypto();
  const base = JSON.stringify({ ...config, viewKey });
  const hashBuffer = await cryptoImpl.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(base)
  );
  const signature = Buffer.from(hashBuffer).toString('hex');
  return {
    key: signature.slice(0, 32),
    config,
    signature,
    issuedAt: Date.now()
  };
}

export function deriveSharedKey(): Uint8Array {
  // Placeholder derivation for demo; integrate ECDH/HKDF with wallet keys in production.
  const cryptoImpl = getWebCrypto();
  return cryptoImpl.getRandomValues(new Uint8Array(32));
}
