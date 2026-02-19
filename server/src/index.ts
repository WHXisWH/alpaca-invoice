/**
 * Aleo Compute Server — Express entry point
 *
 * Exposes a single endpoint:
 *   POST /api/aleo-run
 *
 * And a health probe:
 *   GET  /health
 *
 * Environment variables:
 *   PORT               - HTTP port (default: 3001)
 *   ALEO_API_SECRET    - Optional bearer token; if set, every POST must supply
 *                        "Authorization: Bearer <secret>". Leave unset to disable auth.
 *   ALEO_COMPUTE_TIMEOUT_MS - forwarded to runCompute (default: 25000)
 *   (See aleo-compute.ts for SDK-related env vars)
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import {
  runCompute,
  prewarm,
  ALLOWED_FUNCTIONS,
  ComputeError,
} from './aleo-compute.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const API_SECRET = process.env.ALEO_API_SECRET ?? '';
const COMPUTE_TIMEOUT_MS = parseInt(
  process.env.ALEO_COMPUTE_TIMEOUT_MS ?? '25000',
  10
);

const app = express();

// Limit request body to 64 KB — inputs are short Aleo literal strings
app.use(express.json({ limit: '64kb' }));

// ---------------------------------------------------------------------------
// Auth middleware
// If ALEO_API_SECRET is set, every POST /api/aleo-run must include:
//   Authorization: Bearer <ALEO_API_SECRET>
// Requests without a valid token receive 401 before touching the SDK.
// ---------------------------------------------------------------------------
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!API_SECRET) {
    // Auth disabled — allow all
    next();
    return;
  }
  const header = (req.headers['authorization'] ?? '') as string;
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== API_SECRET) {
    res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization token',
    });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /api/aleo-run
//
// Request body:
//   {
//     functionName : 'compute_invoice_hash' | 'compute_invoice_id'
//     inputs       : string[]   (Aleo literal strings, e.g. "1000u64", "1field")
//     network?     : string     (ignored for now; reserved for multi-network support)
//   }
//
// Success response (200):
//   { ok: true, outputs: string[], durationMs: number }
//
// Error responses:
//   400  BAD_REQUEST    — unknown functionName or wrong input count
//   401  UNAUTHORIZED   — missing/invalid bearer token
//   504  TIMEOUT_SERVER — pm.run exceeded ALEO_COMPUTE_TIMEOUT_MS
//   500  SDK_ERROR      — any other SDK failure
// ---------------------------------------------------------------------------
app.post(
  '/api/aleo-run',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const start = Date.now();

    const { functionName, inputs } = req.body as {
      functionName?: unknown;
      inputs?: unknown;
    };

    // --- Validate functionName against the strict allowlist ---
    if (
      typeof functionName !== 'string' ||
      !(functionName in ALLOWED_FUNCTIONS)
    ) {
      res.status(400).json({
        ok: false,
        code: 'BAD_REQUEST',
        message: `functionName must be one of: ${Object.keys(ALLOWED_FUNCTIONS).join(', ')}`,
      });
      return;
    }

    // --- Validate inputs: must be a string array of exactly the expected length ---
    const expectedCount = ALLOWED_FUNCTIONS[functionName];
    if (
      !Array.isArray(inputs) ||
      inputs.length !== expectedCount ||
      inputs.some((v) => typeof v !== 'string' || v.trim() === '')
    ) {
      res.status(400).json({
        ok: false,
        code: 'BAD_REQUEST',
        message: `"inputs" must be an array of exactly ${expectedCount} non-empty strings for ${functionName}`,
      });
      return;
    }

    // --- Execute ---
    try {
      const outputs = await runCompute(
        functionName,
        inputs as string[],
        COMPUTE_TIMEOUT_MS
      );
      const durationMs = Date.now() - start;
      console.log(`[compute] ${functionName} OK (${durationMs}ms)`);
      res.json({ ok: true, outputs, durationMs });
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const code: string =
        err instanceof ComputeError ? err.code : 'SDK_ERROR';
      const message: string = err?.message ?? 'Internal compute error';
      const httpStatus = code === 'TIMEOUT_SERVER' ? 504 : 500;

      console.error(
        `[compute] ${functionName} FAILED code=${code} (${durationMs}ms): ${message}`
      );
      res.status(httpStatus).json({ ok: false, code, message, durationMs });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /health — used by Render health checks and monitoring
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response): void => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()) });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[server] Aleo compute server listening on port ${PORT}`);
  // Prewarm runs in the background after the port is bound.
  // If it fails, the server remains up and lazily inits on the first request.
  prewarm();
});
