# zk_invoice_v2.aleo Test Suite (legacy zk_invoice.aleo retained for history)

This folder holds the Leo test scaffolding. Wave2 uses `zk_invoice_v2.aleo`; legacy references are retained only for history.

## What’s Covered (20 cases)
- **create_invoice**: happy path, min/max amount, different buyers/nonces.
- **verify_invoice**: hash match / mismatch.
- **mark_as_paid**: buyer marks paid, status progression, duplicate/unauthorized attempts (expected fail).
- **create_seller_receipt**: seller receipt matches buyer receipt, different nonces.
- **cancel_invoice**: seller cancels pending invoice; non-seller and paid-cancel are expected to fail.
- **verify_payment**: match / mismatch.
- **End-to-end lifecycle**: create → verify → pay → seller receipt → verify payment.

## Layout
```
tests/
├── README.md                  # You are here
├── QUICK_REFERENCE.md         # Command cheatsheet
├── TESTING_GUIDE.md           # Step-by-step how-to
├── AUDIT_FLOW_TESTING.md      # UI + CLI audit package validation
├── test_zk_invoice.leo        # 20 test cases
├── inputs/                    # Sample inputs for leo run
└── validate_audit_package.mjs # Offline audit-package validator
```

## How to Run

### Option A: Leo CLI
```bash
# all tests
leo test

# single test
leo test test_create_invoice_success
leo test test_complete_workflow
```

### Option B: Script wrapper
```bash
./run_tests.sh          # full suite
./run_tests.sh create_invoice
./run_tests.sh mark_as_paid
```

### Option C: Manual spot checks
```bash
leo run create_invoice <buyer> 1000000u64 <due_ts> <invoice_hash> <nonce>
leo run verify_invoice "{invoice_record}" <invoice_hash>
leo run mark_as_paid "{buyer_invoice_record}" <payment_nonce>
leo run create_seller_receipt <invoice_id> <payer> <payee> 1000000u64 <payment_nonce>
leo run cancel_invoice "{seller_invoice_record}"
leo run verify_payment "{payment_record}" "{invoice_record}"
```

## Test Data (defaults used in examples)
```
SELLER: aleo1qqqq...3ljyzc
BUYER : aleo1qqqq...k9svjc
AMOUNT: 1000000u64
DUE   : 1735689600u32   # 2025-01-01 00:00:00 UTC
HASH  : 123456789field
NONCE : 99999field
PAYMENT_NONCE: 88888field
STATUS: 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED
```

## Expected Failures to Watch For
- Seller == buyer on create → `assert_neq`.
- Amount = 0 → `assert`.
- Mark-as-paid by non-buyer or repeat → `assert_eq`.
- Cancel by non-seller or cancel paid → `assert_eq`.

## Tips
- Records are UTXO-style: each use consumes the record; always use the freshest output.
- Keep CLI outputs; paste records carefully when chaining steps.
- Types must match signatures (u64/u32/field/address).

## Audit Package Utilities
- UI flow: see `tests/AUDIT_FLOW_TESTING.md`.
- Offline validation: `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`.
