/**
 * Aleo SDK singleton for the compute server.
 *
 * Responsibilities:
 *  - Hold a single ProgramManager instance for the process lifetime
 *  - Cache the on-chain program source so it is only fetched once
 *  - Expose runCompute() with a per-call timeout
 *  - Expose prewarm() to pre-load the SDK and program source at boot
 *
 * Environment variables consumed here:
 *  ALEO_PROGRAM_ID          - Program ID (default: zk_invoice_v2_2.aleo)
 *  ALEO_NODE_URL            - Aleo explorer base URL
 *  ALEO_PROGRAM_SOURCE      - Optional: inline program source (overrides network fetch)
 *  ALEO_COMPUTE_TIMEOUT_MS  - Per-call timeout in ms (default: 25000)
 */

const PROGRAM_ID = process.env.ALEO_PROGRAM_ID ?? 'zk_invoice_v2_2.aleo';
const NODE_URL =
  process.env.ALEO_NODE_URL ?? 'https://api.explorer.provable.com/v1';
const COMPUTE_TIMEOUT_MS = parseInt(
  process.env.ALEO_COMPUTE_TIMEOUT_MS ?? '25000',
  10
);

/**
 * Strict allowlist: maps each permitted functionName to its expected input count.
 * Requests for any other functionName are rejected with BAD_REQUEST before
 * touching the SDK.
 *
 * compute_invoice_id   → 5 inputs  (seller, buyer, amount u64, due_date u32, nonce field)
 * compute_invoice_hash → 10 inputs (seller, buyer, amount u64, tax_amount u64,
 *                                   due_date u32, nonce, order_id, currency,
 *                                   items_hash, memo_hash — all field)
 *
 * These counts mirror the contract closures in build/main.aleo.
 */
export const ALLOWED_FUNCTIONS: Record<string, number> = {
  compute_invoice_id: 5,
  compute_invoice_hash: 10,
};

// ---------------------------------------------------------------------------
// SDK singleton state (module-level, lives for the process lifetime)
// ---------------------------------------------------------------------------

// Lazily-imported SDK module
let sdkCache: typeof import('@provablehq/sdk') | null = null;

// Singleton ProgramManager (one temp account per process, no funds)
let pmCache: InstanceType<
  typeof import('@provablehq/sdk')['ProgramManager']
> | null = null;

// On-chain program source (fetched once, then re-used for every pm.run call)
let programSourceCache: string | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getSdk(): Promise<typeof import('@provablehq/sdk')> {
  if (!sdkCache) {
    sdkCache = await import('@provablehq/sdk');
  }
  return sdkCache;
}

async function getProgramManager(): Promise<
  InstanceType<typeof import('@provablehq/sdk')['ProgramManager']>
> {
  if (pmCache) return pmCache;

  const sdk = await getSdk();

  // A throwaway PrivateKey is required by the SDK constructor even for
  // local-only pm.run calls — no funds are ever spent.
  const pm = new sdk.ProgramManager(NODE_URL);
  const tempKey = new sdk.PrivateKey();
  pm.setAccount(new sdk.Account({ privateKey: tempKey.to_string() }));

  pmCache = pm;
  return pm;
}

async function getProgramSource(): Promise<string> {
  if (programSourceCache) return programSourceCache;

  // ALEO_PROGRAM_SOURCE allows offline / CI usage without hitting the network
  if (process.env.ALEO_PROGRAM_SOURCE) {
    programSourceCache = process.env.ALEO_PROGRAM_SOURCE;
    console.log('[aleo-compute] Program source loaded from ALEO_PROGRAM_SOURCE env');
    return programSourceCache;
  }

  const sdk = await getSdk();
  const client = new sdk.AleoNetworkClient(NODE_URL);

  // AleoNetworkClient.getProgram returns the Leo/Aleo source as a string
  const src = await (client as any).getProgram(PROGRAM_ID);
  if (!src || typeof src !== 'string') {
    throw new Error(
      `Failed to fetch program source for "${PROGRAM_ID}" from ${NODE_URL}`
    );
  }

  programSourceCache = src;
  console.log(`[aleo-compute] Program source cached (${src.length} bytes) for ${PROGRAM_ID}`);
  return programSourceCache;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Typed error produced by this module.
 * code mirrors the response codes sent to callers of POST /api/aleo-run.
 */
export class ComputeError extends Error {
  constructor(
    public readonly code: 'TIMEOUT_SERVER' | 'SDK_ERROR' | 'BAD_REQUEST',
    message: string
  ) {
    super(message);
    this.name = 'ComputeError';
  }
}

/**
 * Execute a whitelisted Aleo function via pm.run with a hard timeout.
 *
 * The caller must have already validated functionName against ALLOWED_FUNCTIONS
 * and confirmed that inputs.length matches the expected count.
 *
 * pm.run(program, functionName, inputs, false):
 *   - program      : full Aleo source (cached from chain)
 *   - functionName : e.g. "compute_invoice_hash"
 *   - inputs       : string array in Aleo literal format
 *   - false        : do not cache the execution trace (local-only, no proof)
 *
 * The SDK ≥ 0.9.x may return either an object with getOutputs() or a plain
 * array; both shapes are handled.
 */
export async function runCompute(
  functionName: string,
  inputs: string[],
  timeoutMs: number = COMPUTE_TIMEOUT_MS
): Promise<string[]> {
  const [pm, program] = await Promise.all([
    getProgramManager(),
    getProgramSource(),
  ]);

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new ComputeError(
          'TIMEOUT_SERVER',
          `Execution timed out for ${functionName} after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      (pm as any).run(program, functionName, inputs, false),
      timeoutPromise,
    ]);

    // Normalise output: SDK may return an object with getOutputs() or
    // a plain array depending on version.
    let outputs: string[] | undefined;
    if (typeof result?.getOutputs === 'function') {
      outputs = result.getOutputs();
    } else if (Array.isArray(result?.outputs)) {
      outputs = result.outputs;
    } else if (Array.isArray(result)) {
      outputs = result;
    }

    if (!outputs || outputs.length === 0) {
      throw new ComputeError(
        'SDK_ERROR',
        `pm.run returned empty output for ${functionName}`
      );
    }

    return outputs;
  } catch (err: any) {
    if (err instanceof ComputeError) throw err;
    // SDK may throw strings, WASM error objects, or non-standard Error shapes;
    // stringify the whole thing so the message is never silently lost.
    const msg =
      err?.message ??
      (typeof err === 'string' ? err : JSON.stringify(err) ?? 'Unknown SDK error');
    throw new ComputeError('SDK_ERROR', msg);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

/**
 * Prewarm the server at boot time.
 *
 * 1. Loads the @provablehq/sdk module (triggers WASM binary fetch & compile).
 * 2. Fetches and caches the on-chain program source.
 * 3. Runs a real compute_invoice_id call to JIT-compile the WASM functions.
 *
 * The dummy inputs are derived from a throwaway SDK PrivateKey so the address
 * format is guaranteed valid — the SDK itself validates address encoding before
 * executing any computation.
 *
 * Non-fatal: if prewarm fails (e.g. Aleo node unreachable at startup), the
 * server still starts and will initialize lazily on the first real request.
 */
export async function prewarm(): Promise<void> {
  console.log('[prewarm] Starting — loading SDK, fetching program source, running trial compute...');
  try {
    const [pm, program, sdk] = await Promise.all([
      getProgramManager(),
      getProgramSource(),
      getSdk(),
    ]);

    // Derive a valid throwaway address to use as dummy seller/buyer.
    // Using a freshly-generated PrivateKey guarantees the address passes the
    // SDK's Bech32m validation without hardcoding any real address.
    const tempKey = new sdk.PrivateKey();
    const tempAddr = new sdk.Account({ privateKey: tempKey.to_string() })
      .address()
      .to_string();

    // compute_invoice_id expects 5 inputs: seller, buyer, amount(u64), due_date(u32), nonce(field)
    const prewarmInputs = [tempAddr, tempAddr, '1u64', '1u32', '1field'];

    await (pm as any).run(program, 'compute_invoice_id', prewarmInputs, false);

    console.log('[prewarm] Done — WASM fully initialized, program source cached');
  } catch (err: any) {
    console.warn('[prewarm] Non-fatal failure (will retry on first request):', err?.message ?? err);
  }
}
