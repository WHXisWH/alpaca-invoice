# Issue Analysis & Fix Recommendations (Testnet, zk_invoice_v2_2.aleo)

## 1) UI freeze when creating invoice
- **Where it happens:** `controller/Transaction/useTransactionController.ts` lines 121–210 — creation flow runs `computeInvoiceHashOffline` and `computeInvoiceIdOffline` via ProgramManager; WASM/top-level-await blocks the main thread (no timeout/fallback).
  ```ts
  // useTransactionController.ts:148-160
  const invoiceHash = await protocolService.computeInvoiceHashOffline({ ... }); // no timeout
  // useTransactionController.ts:184-194
  computedInvoiceId = await protocolService.computeInvoiceIdOffline({ ... });    // no timeout
  ```
- **Why:** Fetching program + executing WASM on the UI thread; failures have no catch/timeout → “true” freeze.
- **Fix (recommended):**
  - Add a short timeout (3–5s) and fall back to local hash/ID (CryptoService) if helper is slow.
  - Lazy-load program once; avoid re-running ProgramManager on main thread (consider Web Worker or backend helper).
  - Update progress UI before awaiting heavy calls to keep the UI responsive.

## 2) Sync wipes locally-kept nonce/audit key
- **Where it happens:** `stores/invoiceStore.ts` fetch/update paths overwrite invoice objects with chain data, no separation for local-only fields (nonce, audit key).
  - Example: `payInvoice` (stores/invoiceStore.ts ~40–100) refreshes `sentInvoices/receivedInvoices` from service; local-only fields are lost.
- **Impact:** Locally generated nonce and audit key (original hex) disappear after sync.
- **Fix (recommended):**
  - Keep a dedicated local store for private metadata (per invoice): `{ nonce, auditKey, scopes?, expiresAt? }` and never overwrite it on sync.
  - When merging chain data, only replace chain-truth fields (status/hash/anchors), leave local-only metadata intact.
  - After create, immediately persist nonce/auditKey to that local store; during sync merge, attach them back if present.

## 3) Service-layer recomputations brittle vs on-chain truth
- **Where it happens:** multiple spots rely on re-running contract logic in JS:
  - Hash/ID computation (see #1).
  - Audit verification re-evaluates rules/commitments instead of leaning on on-chain asserts.
- **Why risky:** WASM helpers may fail/lag; diverging logic risks false failures.
- **Fix (recommended):**
  - “Query/Assert first, compute second”: prefer getter caches + `assert_*` transitions for verification; keep local recompute as optional check with try/catch.
  - Centralize ProgramManager helpers in AleoProtocolService with timeouts; disallow ad-hoc run() from UI.
  - In audit validation, enforce “disclosed fields ⊆ scopes_bitmask” when authorization exists; otherwise warn but still show anchor checks.

## 4) Receipts not persisted before (now patched)
- **Where:** `components/receipt-viewer.tsx` used `paymentReceipts` from invoiceStore; executePay didn’t add receipts.
  ```ts
  // useTransactionController.ts:430-438 now adds receiptStore.addReceipt(...)
  // receipt-viewer.tsx now reads persisted receipts and exports CSV
  ```
- **Status:** Fixed in current code (receipts stored & visible). No action needed.

## 5) Build-time warnings (not blocking)
- **Where:** Build logs mention `@provablehq/wasm` top-level await.
- **Fix:** None required for functionality; optional: lazy import SDK only client-side or ignore warning in CI.

---
## Proposed remediation order
1) Add timeout + fallback for ProgramManager helpers (hash/ID) in `useTransactionController.ts`; keep UI responsive.
2) Introduce a private metadata store for nonce/audit key and adjust sync merge in `stores/invoiceStore.ts`.
3) Harden audit verification flow: assert-first, recompute second; add scopes subset check.
4) (Optional) Move heavy WASM calls to a worker or backend helper to avoid main-thread stalls.
