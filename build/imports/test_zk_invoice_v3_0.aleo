import credits.aleo;
import usdcx_stablecoin.aleo;
import zk_invoice_v3_0.aleo;
program test_zk_invoice_v3_0.aleo;

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
    tax_tag as field;
    jct_registration as field;

struct AuditAuthorization:
    audit_key_hash as field;
    scopes_bitmask as u64;
    expires_at as u32;
    issuer as address;

struct TaxGroup:
    rate_bps as u64;
    net_sum as u64;
    tax_sum as u64;

struct TaxGroups:
    group_a as TaxGroup;
    group_b as TaxGroup;

struct CreateInvoiceJct:
    tax_groups as TaxGroups;
    tax_tag as field;
    total_amount as u64;
    jct_registration as field;
    currency_flag as u8;

function placeholder:
    output true as boolean.private;
