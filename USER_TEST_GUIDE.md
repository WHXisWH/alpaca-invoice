# User Testing Guide (Frontend, Testnet, zk_invoice_v2_2.aleo)

Goal: Validate end-to-end flows as a user on Aleo testnet with the deployed program `zk_invoice_v2_2.aleo` (tx at13cmxw90rn5xux4gj7xejyz7jlc5yc7ugkjl8hv7rdgqp4l7uwcfq87ps78).

## Prerequisites
- Two Aleo accounts (Seller, Buyer) in Leo Wallet or Puzzle Wallet on testnet.
- `.env` already points to `NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v2_2.aleo`.
- Run app locally (`npm run dev`) or on your deployed testnet frontend.

## Happy Path
1) **Create invoice (Seller)**
   - Go to `/invoice/create`.
   - Fill buyer address, amount, description, due date.
   - Toggle “Enable audit authorization”, keep default scopes (amount/tax/buyer/seller), expiry +7d, set any audit key string.
   - Submit; wait for SENDING → CONFIRMED; invoice detail page shows commitments/rules/auth/counter.
2) **Generate audit package (Seller)**
   - Go to `/audit`, select the new invoice, pick fields (amount/tax/buyer/seller), expiry +2d.
   - Download JSON + note the audit key.
3) **Validate package (Auditor/anyone)**
   - Paste package JSON + audit key in `/audit` validator.
   - Expect “Valid package”, R1–R5 pass, anchors and asserts all green.
4) **Pay invoice (Buyer)**
   - Open `/invoices/[id]` as buyer; click Pay.
   - Status should become PAID; audit counter unchanged (only create/cancel affect count).
5) **Re-validate package**
   - Re-run validator; chain status should reflect PAID.

## Negative Checks
1) **Expired package**: Edit `expires_at` in JSON to a past value; validator should show `expired`.
2) **Tampered rules_hash**: Change `rules_hash` to another field string; expect assertRules failure.
3) **Tampered commitments_root**: Change `commitments_root`; expect assertCommitment failure.
4) **Unauthorized scopes** (if you reduced scopes in authorization): generate package with fields outside authorized bitmask; expect ownership/amount asserts to fail or validator to mark invalid.

## What to record
- Tx hashes for create/pay (and cancel if tested).
- Screenshots of validator results (anchors + asserts) for valid and each negative case.
- Any unexpected errors.

## Notes
- Build warning about @provablehq wasm top-level await is expected on testnet; runtime not affected in supported browsers.
- Legacy invoices (pre-v2_2) are read-only and have no audit features.***
