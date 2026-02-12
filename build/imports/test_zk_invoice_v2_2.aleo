import zk_invoice_v2_2.aleo;
program test_zk_invoice_v2_2.aleo;

struct FieldCommitments:
    amount as field;
    tax_amount as field;
    due_date as field;
    buyer as field;
    seller as field;
    currency as field;
    items_hash as field;
    memo_hash as field;
    order_id as field;

struct AuditAuthorization:
    audit_key_hash as field;
    scopes_bitmask as u64;
    expires_at as u32;
    issuer as address;

function placeholder:
    output true as boolean.private;
