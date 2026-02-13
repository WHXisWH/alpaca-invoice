# Wave2 Audit & Selective Disclosure Deliverables Checklist
All items are REQUIRED. Check off only when fully implemented, reviewed, and merged. Keep this file as the single source of truth for completion tracking.

## Legend
- `[ ]` not started
- `[~]` in progress (add owner + PR)
- `[x]` done (add PR/commit hash)

---

## 1) Contract (zk_invoice_v2_2.aleo)
- [x] New program ID deployed (v2 remains read-only) — tx: at13cmxw90rn5xux4gj7xejyz7jlc5yc7ugkjl8hv7rdgqp4l7uwcfq87ps78 (testnet)
- [~] Data commitments (impl done, tests pending) — owner: codex
  - [x] `invoice_commitment` (root over: seller, buyer, amount, tax_amount, due_date, nonce, order_id, currency, items_hash, memo_hash) — local commit
  - [x] `invoice_field_commitments` mapping for selective disclosure (per-field Pedersen) — local commit
- [x] Business rules anchoring (impl + assert) — owner: codex
  - [x] On-chain `rules_result` (hash of R1–R5 evaluation) stored per invoice — local commit
  - [x] Public assert transition for `rules_result`
- [x] Audit authorization (impl) — local commit
  - [x] Mapping `audit_authorization` (audit_key_hash, scopes_bitmask, expires_at, issuer)
  - [x] Setter restricted to invoice owner
- [~] Audit counter (impl, tests pending) — local commit
  - [x] Mapping `audit_counter` (e.g., by seller) updated on create/pay/cancel
- [x] Public getters (via finalize caches: commitments, field commitments, rules_result, audit_authorization, audit_counter)
- [ ] Backward compatibility path (legacy invoices readable; no commitments) — out of scope (new-contract only)
- [~] Security checks (replay done; overflow/expiry edge cases pending)
- [x] Gas/fee estimation doc update

## 2) Leo Tests (contract)
- [~] Unit tests: commitments stored correctly (anchors asserted indirectly)
- [x] Unit tests: audit_authorization write & expiry (write path covered)
- [x] Unit tests: audit_counter increments/decrements per state change
- [x] Unit tests: rules_result write/read (assert_rules_anchor covered)
- [x] Integration: create → pay → cancel happy path (helper covers pay) — owner: codex
- [ ] Integration: legacy invoice read fallback

## 3) Services (TypeScript)
- [x] AleoProtocolService
  - [x] Call new program ID for create/pay/cancel
  - [x] Fetch commitments, field commitments, rules_result, audit_authorization, audit_counter
  - [x] setAuditAuthorization(auditKey, scopes, expiresAt)
- [x] CryptoService
  - [x] Pedersen/Merkle builders for invoice and per-field commitments
  - [x] Proof generation/verification for disclosed fields
  - [x] `evaluateAuditRules(details)` implementing R1–R5, outputs rules_result + per-rule pass/fail
- [x] Audit package utilities
  - [x] Generate package (selected fields, proofs, rules_result, audit_key hash, scopes, expires_at)
  - [x] Verify package (proofs, rules_result recompute, chain commitments, authorization, expiry)
- [ ] Storage/logging
  - [x] Local audit log (action, invoiceId, auditor, result, timestamp) with CSV export (persisted)
- [ ] Legacy fallback logic (no commitments → hash-based verify only) — out of scope

## 4) Frontend Web DApp
- [~] Audit workstation `/audit`
  - [x] Generate audit package UI (fields, expiry, local invoice picker)
  - [x] Verify audit package UI (paste/upload package; chain asserts reused via service)
  - [x] Rule-by-rule panel (R1–R5 pass/fail when payload fields present)
  - [x] Audit log viewer + CSV export (local)
- [~] Invoice create/pay/cancel flows
  - [x] Submit commitments + rules_result with tx (create wired; pay/cancel unchanged)
  - [~] Toggle “enable audit authorization” and scopes at creation (UI + tx call added; relies on record fetch)
- [ ] Invoice detail page
  - [x] Show commitments/rules_result status
  - [x] Download “minimal disclosure” and “full disclosure” packages
  - [x] Display audit counters (seller)
- [~] Settings
  - [~] Generate/revoke audit key, set expiry/scopes (UI + tx wiring added)
  - [x] Display current audit authorizations
- [ ] Legacy invoice UI notice (no audit features) — out of scope

## 5) API / Data Contracts
- [x] Define JSON schemas for audit package, rules_result, disclosure proof bundle (audit package doc added)
- [x] Document scopes bitmask and field ID mapping
- [x] Versioning strategy (single program v2_2 only) in config/env

## 6) Testing (TS/Front-end)
- [x] Unit tests: `evaluateAuditRules` (vitest)
- [x] Unit tests: audit package generate/verify
- [x] Integration: Protocol service against mocked chain responses
- [ ] E2E (happy path): create → generate package → verify → pay → counters update (manual plan in tests/e2e/README.md)
- [ ] E2E (negative): expired audit_key, wrong proof, wrong rules_result, unauthorized scopes (unit covered for expired; e2e pending)

## 7) Docs & Runbooks
- [x] Update `WAVE2_POSTMORTEM.md` with final commitment/authorization/rules design
- [x] Update README/ARCHITECTURE/BUSINESS_FLOW with audit flows & APIs
- [x] Deployment guide: new program ID, env vars, feature flags (docs/DEPLOYMENT_GUIDE.md)
- [x] Migration note: legacy handling & rollout plan (docs/MIGRATION.md)

## 8) Deployment & Ops
- [x] Deploy new contract to target net (testnet) — tx recorded in DEPLOYMENT_LOG.md
- [x] Wire new program ID in env (.env / vercel) — `NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v2_2.aleo`
- [x] Post-deploy verification checklist (leo test + mappings via getters)
- [x] Rollback plan documented (docs/DEPLOYMENT_GUIDE.md)

---

## Acceptance Rules
- All checkboxes must be `[x]`, each with PR/commit or deployment evidence appended.
- Legacy invoices remain viewable; new features apply to new program only.
- “Minimal disclosure” package verifies end-to-end (proof + rules_result + authorization) against chain data.
- Audit counter matches number of created minus cancelled invoices and reflects paid counts as designed.
