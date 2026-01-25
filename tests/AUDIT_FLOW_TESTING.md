# Audit Flow Testing & Debugging Guide

This guide explains how to manually test and debug the selective-disclosure (audit package) feature end-to-end. It also ships a small helper script for offline validation.

## Prerequisites
- Node.js 18+ (for Next.js dev server and the helper script).
- An Aleo wallet that supports `signMessage` (Leo Wallet via demox adapter).
- At least one invoice **with details stored locally** (created from this app while connected to your wallet).

## Quick Manual Test (UI)
1. Start the app: `npm run dev` (or `pnpm dev`) and open http://localhost:3000.
2. Connect your Aleo wallet; ensure a master key has been derived (creating/paying an invoice does this).
3. Go to **/audit**.
4. **Generate package**
   - Enter an existing `invoiceId`, auditor address, expiry date.
   - Tick the permissions you want to disclose.
   - Click **Generate** → you should see an audit key (hex) and a JSON package.
   - Click **Download JSON**.
5. **Validate package**
   - Paste the downloaded JSON and the audit key into the **Validate Audit Package** panel.
   - Click **Validate**.
   - Expect “Valid package” and the decrypted fields matching the permissions you selected.
6. Negative checks:
   - Change one character in the audit key or JSON → validation should fail.
   - Set the expiry date in the past → validation should fail.

## Offline Validator Script
Use the helper to validate a saved package without running the UI.

```
node tests/validate_audit_package.mjs /path/to/package.json <audit_key_hex>
```

What it does:
- Verifies expiry.
- Recomputes cipher hash.
- Decrypts with the provided audit key.
- Recomputes `invoice_hash` from disclosed `details` and compares with the package’s `invoiceHash`.
- Prints a PASS/FAIL summary and, on success, the decrypted payload.

## Debug Tips
- If generation fails with “Invoice details are missing”, re-open the invoice in the same session to ensure it is decrypted with your master key, then try again.
- Wallet must expose `signMessage`; if you see “Wallet does not support signMessage”, switch to Leo Wallet.
- Linting was previously blocked by the Next.js ESLint setup prompt; run `npm run lint` once you finish that setup to catch static issues.
