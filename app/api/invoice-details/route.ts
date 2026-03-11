import { NextRequest, NextResponse } from 'next/server';
import { redis, kvKey, DETAILS_TTL } from '@/lib/redis';

/**
 * POST /api/invoice-details
 * Body: { invoiceHash, invoiceId?, details: EncryptedPayload }
 * Saves encrypted invoice details (EncryptedPayload = { iv, ciphertext, authTag? }) to Upstash Redis
 * so the buyer can retrieve and decrypt them by invoiceHash or invoiceId.
 * API does not interpret plain vs encrypted; it stores the payload as-is.
 */
export async function POST(req: NextRequest) {
  try {
    const { invoiceHash, invoiceId, details } = await req.json();

    if (!invoiceHash || !details) {
      return NextResponse.json({ error: 'Missing invoiceHash or details' }, { status: 400 });
    }

    const ops: Promise<unknown>[] = [
      redis.set(kvKey.byHash(invoiceHash), details, { ex: DETAILS_TTL }),
    ];

    // Store by invoiceId as well so receipt page can look up by invoice ID
    if (invoiceId && invoiceId !== invoiceHash) {
      ops.push(redis.set(kvKey.byId(invoiceId), details, { ex: DETAILS_TTL }));
    }

    await Promise.all(ops);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/invoice-details]', err);
    return NextResponse.json({ error: 'Failed to save details' }, { status: 500 });
  }
}

/**
 * GET /api/invoice-details?invoiceHash=xxx
 * GET /api/invoice-details?invoiceId=xxx
 * Returns the stored payload (EncryptedPayload), or { details: null } if not found.
 * Client must decrypt with CryptoService.decryptPayloadWithInvoiceId(payload, invoiceId).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const invoiceHash = searchParams.get('invoiceHash');
    const invoiceId   = searchParams.get('invoiceId');

    if (!invoiceHash && !invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceHash or invoiceId' }, { status: 400 });
    }

    let details: unknown = null;

    if (invoiceHash) {
      details = await redis.get(kvKey.byHash(invoiceHash));
    }
    if (!details && invoiceId) {
      details = await redis.get(kvKey.byId(invoiceId));
    }

    return NextResponse.json({ details: details ?? null });
  } catch (err) {
    console.error('[GET /api/invoice-details]', err);
    return NextResponse.json({ error: 'Failed to fetch details' }, { status: 500 });
  }
}
