# Audit Package API (v2.2)

This document defines the audit package schema, scopes bitmask, and sample requests for zk_invoice_v2_2.aleo.

## Schema (JSON)
```json
{
  "version": "2.2",
  "program_id": "zk_invoice_v2_2.aleo",
  "invoice_id": "123field",
  "invoice_hash": "456field",
  "rules_hash": "789field",
  "commitments_root": "321field",
  "field_commitments": {
    "amount": "field",
    "tax_amount": "field",
    "due_date": "field",
    "buyer": "field",
    "seller": "field",
    "currency": "field",
    "items_hash": "field",
    "memo_hash": "field",
    "order_id": "field"
  },
  "audit_key_hash": "field",
  "scopes_bitmask": "7",
  "expires_at": 1700000000000,
  "selected_fields": ["amount", "tax_amount", "buyer"],
  "payload": {
    "amount": "1000000",
    "tax_amount": "100000",
    "due_date": 1700000000,
    "buyer": "aleo1...",
    "seller": "aleo1...",
    "currency": "USD",
    "expected_total": "1100000",
    "tax_rate_bps": 1000,
    "line_items_sum": "1000000"
  },
  "signature": "optional-wallet-signature"
}
```

## Scopes bitmask (1-based)
- 1: amount  
- 2: tax_amount  
- 3: due_date  
- 4: buyer  
- 5: seller  
- 6: currency  
- 7: items_hash  
- 8: memo_hash  
- 9: order_id  

Bitmask is `1 << (id-1)` OR’ed for selected fields.

## Sample requests
- **Generate minimal package** (UI): select fields → POST off-chain to exporter or generate in-browser, then share JSON.
- **Verify package**: client recomputes rules_hash, checks commitments_root, and calls on-chain asserts: `assert_rules_anchor`, `assert_commitment_anchor`, `assert_amount_anchor` (optional), `assert_ownership_anchor` (optional).

## Compatibility
- Version pinned to `2.2`; include `program_id` and `version` in all payloads.
- Legacy invoices (no commitments) should fall back to hash-only verification.
