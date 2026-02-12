# Test Quick Reference

One-page cheat sheet for running zk_invoice_v2.aleo flows (legacy commands kept for reference).

## Fast Path
```bash
leo build                  # compile
./run_tests.sh             # full suite (20 cases)
./run_tests.sh create_invoice   # feature-focused subset
```

## Core Commands

### create_invoice
```bash
leo run create_invoice <buyer> 1000000u64 1735689600u32 123456789field 99999field 1700000000u32 0field 0u64
leo run create_invoice <buyer> 1u64 1735689600u32 123456789field 11111field 1700000000u32 0field 0u64      # min
leo run create_invoice <buyer> 18446744073709551615u64 1735689600u32 123456789field 22222field 1700000000u32 0field 0u64  # max
```

### verify_invoice
```bash
leo run verify_invoice "{invoice_record}" 123456789field      # expect true
leo run verify_invoice "{invoice_record}" 987654321field      # expect false
```

### mark_as_paid
```bash
leo run mark_as_paid "{buyer_invoice_record}" 88888field 1700000000u32
```

### create_seller_receipt
```bash
leo run create_seller_receipt 1234567890field <buyer> <seller> 1000000u64 88888field
```

### cancel_invoice
```bash
leo run cancel_invoice "{seller_invoice_record}"
```

### verify_payment
```bash
leo run verify_payment "{payment_record}" "{invoice_record}"
```

## End-to-End Happy Path
```bash
# 1) create invoice
leo run create_invoice <buyer> 1000000u64 1735689600u32 123456789field 99999field
# capture seller_record, buyer_record

# 2) verify hash
leo run verify_invoice "{buyer_record}" 123456789field

# 3) pay
leo run mark_as_paid "{buyer_record}" 88888field
# capture payment_record, updated_invoice

# 4) seller receipt
leo run create_seller_receipt <invoice_id> <buyer> <seller> 1000000u64 88888field

# 5) verify payment
leo run verify_payment "{payment_record}" "{updated_invoice}"
```

## Should Fail (negative checks)
| Scenario | Command sketch | Expected |
|----------|----------------|----------|
| seller == buyer | `leo run create_invoice <caller> ...` | assert_neq |
| amount = 0 | `leo run create_invoice <buyer> 0u64 ...` | assert |
| non-buyer marks paid | run as seller | assert_eq |
| mark paid twice | reuse paid invoice | assert_eq |
| non-seller cancel | run as buyer | assert_eq |
| cancel after paid | cancel paid invoice | assert_eq |

## Handy constants (examples)
```
SELLER: aleo1qqqq...3ljyzc
BUYER : aleo1qqqq...k9svjc
AMOUNT: 1000000u64
DUE   : 1735689600u32
HASH  : 123456789field
NONCE : 99999field
PAYMENT_NONCE: 88888field
```

## Utilities
- Offline audit package validator: `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`
- Verbose output: `leo run --verbose ...`
- Clean build: `leo clean`
