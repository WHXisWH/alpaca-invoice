# Alpaca Invoice — Wave 2 Postmortem & Delivery Report

## 1. Wave 1 Findings (Problems We Had)
- **No public anchors**: Records only (UTXO). Auditors could not independently verify anything on-chain; full trust required in provided JSON.
- **Mapping misunderstanding**: We assumed mappings/async were not supported on testnet. That was wrong and cost us verifiability points.
- **Timestamp bug**: `created_at` hardcoded to `0u32` (1970-01-01).
- **Invoice ID mismatch**: Frontend random nonce differed from on-chain `BHP256::hash(InvoiceData)`.
- **Audit model gap**: AuditPackage entirely off-chain; no link to chain anchors; auditors had no cryptographic anchor.
- **No ZK compliance proofs**: Could not prove rules (tax, amount range) without disclosing values.
- **View-key confusion**: Ambiguity around sharing view keys; privacy risks not documented.

## 2. Wave 2 Design Decisions
- **Hybrid privacy + public verifiability**: Keep Records private; add minimal public anchors via mappings.
- **Async transitions + finalize**: All mapping writes happen in finalize to keep transition bodies private.
- **Minimal disclosure**: Mappings store only `invoice_id → invoice_hash`, `invoice_id → status`, `seller → invoice_count` (optional transparency).
- **Deterministic IDs**: Enforce single source of truth using `compute_invoice_id` parity across frontend/backend.
- **Audit model v2**: Chain-verifiable AuditPackage (versioned), selective disclosure stays off-chain, anchors on-chain.
- **ZK compliance**: Add proofs for tax compliance, amount range, and ownership without revealing values.
- **B2B/B2C posture**: Walletless verification page for consumers; mapping-first polling for enterprise speed.
- **Optional extras**: Commitment-based invoice_count left as future toggle; audit report Record optional.

## 3. What We Built in Wave 2
### 3.1 Smart Contract (`zk_invoice_v2.aleo`)
- Added mappings: `invoice_registry`, `invoice_status`, `invoice_count`.
- Converted core flows to async/finalize: `create_invoice`, `mark_as_paid`, `cancel_invoice`.
- Record schema extensions: `order_id`, `tax_amount`, fixed `created_at`, `paid_at`.
- Helper: `compute_invoice_id` transition for deterministic IDs.
- ZK proofs: `prove_tax_compliance`, `prove_amount_in_range`, `prove_invoice_ownership` (finalize checks mapping).
- Optional Record: `AuditReport` (not critical path).
- Deployment: testnet `zk_invoice_v2.aleo` (tx `at1u8j3krev6u...`). Program metadata updated.

### 3.2 Frontend / Services
- **Program switch**: All service/constants use `zk_invoice_v2.aleo`; legacy ID kept only for history.
- **Transaction params**: New args (`current_time`, `order_id`, `tax_amount`, `paid_at`) wired in controllers and services.
- **Invoice ID parity**: Frontend computes invoice_id via offline `compute_invoice_id` (ProgramManager.run) before submit; fallback only if unavailable.
- **Mapping helpers**: `getInvoiceHash/Status/Count`, `verifyInvoiceOnChain`; 30s caches for hash/status.
- **Polling**: Mapping-first quick check, then record scan; chain status cached in store.
- **Walletless verify**: `/verify` page lets anyone check invoice existence/hash/status without a wallet.
- **Audit flow v2**: AuditPackage supports chainVerifiable flag, programId; validator performs chain hash/status checks; UI shows chain verification and exports audit snapshot.
- **ZK proof hooks**: Proof requests wired to new transitions; proof tx can be reused across audit packages.

### 3.3 Documentation & Tooling
- Updated READMEs (root, tests) and architecture/business flow docs to v2.
- Added detailed English test plans for protocol, wallet, crypto, storage, status validator.
- ESLint configured (`next/core-web-vitals`), lint passes.
- Vitest suite passing (246 tests); Leo test suite migrated to v2 and expanded with ZK proof cases.

## 4. Fixes Mapped to Wave 1 Issues
- **Public anchors missing** → Added mappings + async finalize; verify via `getInvoiceHash/Status`.
- **Mapping unsupported assumption** → Corrected, rebuilt with async/finalize; documented capability.
- **Timestamp zero** → `created_at`/`paid_at` now passed from frontend.
- **Invoice ID mismatch** → Deterministic invoice_id computed both sides (`compute_invoice_id`).
- **Audit unverifiable** → AuditPackage v2 with chain hash/status checks + UI display + snapshot export.
- **No ZK proofs** → Added tax compliance, amount range, ownership proofs.
- **View key risk** → Documented: view key for self-decrypt only; not for sharing.

## 5. Current Open Items / Optional Work (Wave 3 candidates)
- **Commitment-based invoice_count** toggle (hide seller address while preserving counts).
- **Audit report Record statistics** (public stats without leaking results).
- **Multi-role workspace UX** (issuer/finance/auditor views) and demo assets.
- **Further doc cleanup**: minor legacy references and any remaining non-English comments outside Wave2 doc.
- **Security**: npm reports vulnerabilities; audit/fix pending (may involve breaking changes).

## 6. How to Verify (Quick Checklist)
- `npx next lint` → passes.  
- `npm test` (vitest) → all green (246).  
- Leo: `leo test` on `tests/test_zk_invoice.leo` (async/mapping/ZK cases).  
- Walletless check: open `/verify`, query a known `invoice_id`.  
- Audit flow: generate package (v2), validate to see chain verification block and export snapshot.  
- ZK proof demo: call `prove_tax_compliance` / `prove_amount_in_range` with private InvoiceRecord.

## 7. Release Notes (tl;dr)
Wave 2 transforms Alpaca Invoice into a privacy-first yet verifiable audit platform: private Records stay private; public anchors via mappings enable independent verification; ZK proofs enforce rules without revealing numbers; audit packages become chain-verifiable; walletless verification supports B2C scenarios; deterministic IDs and correct timestamps close Wave 1 gaps. Remaining optional items are commitment-style counts and UX polish for multi-role/audit assets.
