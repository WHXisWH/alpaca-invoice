# zk_invoice_v2_2.aleo Test Suite

Leo tests targeting the current program `zk_invoice_v2_2.aleo` (Wave2). Legacy v2 artifacts are kept for history only.

## What’s Covered
- **create_invoice**: happy path, min/max amount, buyer/seller guards, nonce uniqueness.
- **verify_invoice**: hash match / mismatch.
- **mark_as_paid**: buyer-only, duplicate/unauthorized attempts.
- **create_seller_receipt**: parity with buyer receipt.
- **cancel_invoice**: seller-only, and disallow cancel after paid.
- **commitments / rules caches**: anchors present and consistent.
- **audit authorization**: set_audit_authorization success/guards.
- **End-to-end lifecycle**: create → verify → pay → receipt → verify payment.

## Layout
```
tests/
├── README.md                  # You are here
├── QUICK_REFERENCE.md         # Command cheatsheet
├── TESTING_GUIDE.md           # Step-by-step how-to
├── AUDIT_FLOW_TESTING.md      # UI + CLI audit package validation
├── test_zk_invoice_v2_2.leo   # Current suite
├── inputs/                    # Sample inputs for leo run
└── validate_audit_package.mjs # Offline audit-package validator
```

## How to Run

### Option A: Leo CLI
```bash
# all tests for v2_2
leo test -p test_zk_invoice_v2_2

# single test
leo test test_create_invoice_success -p test_zk_invoice_v2_2
leo test test_set_audit_authorization -p test_zk_invoice_v2_2
```

### Option B: Script wrapper (invokes leo test under the hood)
```bash
./run_tests.sh          # full suite
./run_tests.sh create_invoice
./run_tests.sh mark_as_paid
```

### Option C: Manual spot checks (v2_2 signature)
```bash
leo run create_invoice <buyer>
  <amount_u64> <tax_amount_u64> <due_ts_u32> <invoice_hash_field> <nonce_field>
  <current_time_u32> <order_id_field> <currency_field> <items_hash_field> <memo_hash_field>
  <line_items_sum_u64> <expected_total_u64> <tax_rate_bps_u64>

leo run verify_invoice "{invoice_record}" <invoice_hash_field>
leo run mark_as_paid "{buyer_invoice_record}" <payment_nonce_field> <paid_at_u32>
leo run create_seller_receipt <invoice_id_field> <payer> <payee> <amount_u64> <payment_nonce_field>
leo run cancel_invoice "{seller_invoice_record}"
leo run verify_payment "{payment_record}" "{invoice_record}"
leo run set_audit_authorization "{invoice_record}" <audit_key_hash_field> <scopes_bitmask_u64> <expires_at_u32> <current_time_u32>
```

## Test Data (defaults used in examples)
```
SELLER: aleo1qqqq...3ljyzc
BUYER : aleo1qqqq...k9svjc
AMOUNT: 1000000u64
TAX   : 100000u64  (10%)
DUE   : 1735689600u32   # 2025-01-01 00:00:00 UTC
HASH  : 123456789field
NONCE : 99999field
PAYMENT_NONCE: 88888field
STATUS: 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED
```

## Expected Failures to Watch For
- Seller == buyer on create → `assert_neq`.
- Amount = 0 → `assert`.
- Tax amount mismatches rules (R1/R3/R4) → `assert_eq`.
- Mark-as-paid by non-buyer or repeat → `assert_eq`.
- Cancel by non-seller or cancel paid → `assert_eq`.
- set_audit_authorization by non-seller or expired → `assert_eq`.

## Tips
- Records are UTXO-style: each use consumes the record; always use the freshest output.
- Keep CLI outputs; paste records carefully when chaining steps.
- Types must match signatures (u64/u32/field/address).

## Audit Package Utilities
- UI flow: see `tests/AUDIT_FLOW_TESTING.md`.
- Offline validation: `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`.
