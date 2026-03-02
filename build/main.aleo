import credits.aleo;
import usdcx_stablecoin.aleo;
program zk_invoice_v3_0.aleo;

record InvoiceRecord:
    owner as address.private;
    invoice_id as field.private;
    seller as address.private;
    buyer as address.private;
    amount as u64.private;
    tax_amount as u64.private;
    invoice_hash as field.private;
    due_date as u32.private;
    created_at as u32.private;
    status as u8.private;
    order_id as field.private;
    currency as field.private;
    items_hash as field.private;
    memo_hash as field.private;
    tax_tag as field.private;
    jct_registration as field.private;
    total_amount as u64.private;
    currency_flag as u8.private;

record PaymentRecord:
    owner as address.private;
    payment_id as field.private;
    invoice_id as field.private;
    payer as address.private;
    payee as address.private;
    amount as u64.private;
    paid_at as u32.private;
    settlement_anchor as field.private;

struct InvoiceData:
    seller as address;
    buyer as address;
    amount as u64;
    due_date as u32;
    invoice_number as field;

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

struct InvoiceHashInput:
    seller as address;
    buyer as address;
    amount as u64;
    tax_amount as u64;
    due_date as u32;
    nonce as field;
    order_id as field;
    currency as field;
    items_hash as field;
    memo_hash as field;

struct FieldCommitInput:
    val as field;
    salt as field;
    tag as field;

struct RulesBits:
    r1 as boolean;
    r2 as boolean;
    r3 as boolean;
    r4 as boolean;
    r5 as boolean;

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

mapping invoice_registry:
    key as field.public;
    value as field.public;

mapping invoice_status:
    key as field.public;
    value as u8.public;

mapping invoice_count:
    key as address.public;
    value as u64.public;

mapping invoice_commitment:
    key as field.public;
    value as field.public;

mapping invoice_field_commitments:
    key as field.public;
    value as FieldCommitments.public;

mapping invoice_rules_result:
    key as field.public;
    value as field.public;

mapping audit_authorization:
    key as field.public;
    value as AuditAuthorization.public;

mapping audit_counter:
    key as address.public;
    value as u64.public;

mapping invoice_tax_tag:
    key as field.public;
    value as field.public;

mapping invoice_jct_reg:
    key as field.public;
    value as field.public;

mapping invoice_tx_id:
    key as field.public;
    value as field.public;

mapping getter_commitment_cache:
    key as field.public;
    value as field.public;

mapping getter_field_commitments_cache:
    key as field.public;
    value as FieldCommitments.public;

mapping getter_rules_cache:
    key as field.public;
    value as field.public;

mapping getter_auth_cache:
    key as field.public;
    value as AuditAuthorization.public;

mapping getter_counter_cache:
    key as address.public;
    value as u64.public;

mapping getter_tax_tag_cache:
    key as field.public;
    value as field.public;

mapping getter_jct_reg_cache:
    key as field.public;
    value as field.public;

mapping getter_tx_id_cache:
    key as field.public;
    value as field.public;

closure compute_invoice_id_internal:
    input r0 as address;
    input r1 as address;
    input r2 as u64;
    input r3 as u32;
    input r4 as field;
    cast r0 r1 r2 r3 r4 into r5 as InvoiceData;
    hash.bhp256 r5 into r6 as field;
    output r6 as field;

closure compute_invoice_hash_internal:
    input r0 as address;
    input r1 as address;
    input r2 as u64;
    input r3 as u64;
    input r4 as u32;
    input r5 as field;
    input r6 as field;
    input r7 as field;
    input r8 as field;
    input r9 as field;
    cast r0 r1 r2 r3 r4 r5 r6 r7 r8 r9 into r10 as InvoiceHashInput;
    hash.bhp256 r10 into r11 as field;
    output r11 as field;

closure compute_tax_tag:
    input r0 as TaxGroups;
    hash.bhp256 r0 into r1 as field;
    output r1 as field;

closure tax_group_valid:
    input r0 as TaxGroup;
    is.eq r0.rate_bps 0u64 into r1;
    is.eq r0.net_sum 0u64 into r2;
    is.eq r0.tax_sum 0u64 into r3;
    and r2 r3 into r4;
    div r0.net_sum 10000u64 into r5;
    mul r5 r0.rate_bps into r6;
    is.eq r0.tax_sum r6 into r7;
    ternary r1 r4 r7 into r8;
    output r8 as boolean;

closure tax_groups_sum:
    input r0 as TaxGroups;
    add r0.group_a.net_sum r0.group_a.tax_sum into r1;
    add r0.group_b.net_sum r0.group_b.tax_sum into r2;
    add r1 r2 into r3;
    output r3 as u64;

closure compute_rules_result:
    input r0 as boolean;
    input r1 as boolean;
    input r2 as boolean;
    input r3 as boolean;
    input r4 as boolean;
    cast r0 r1 r2 r3 r4 into r5 as RulesBits;
    hash.bhp256 r5 into r6 as field;
    output r6 as field;

closure commit_field:
    input r0 as field;
    input r1 as field;
    input r2 as field;
    cast r0 r1 r2 into r3 as FieldCommitInput;
    hash.bhp256 r3 into r4 as field;
    output r4 as field;

function create_invoice:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u32.private;
    input r4 as field.private;
    input r5 as field.private;
    input r6 as u32.private;
    input r7 as field.private;
    input r8 as field.private;
    input r9 as field.private;
    input r10 as field.private;
    input r11 as u64.private;
    input r12 as u64.private;
    input r13 as u64.private;
    input r14 as CreateInvoiceJct.private;
    assert.neq self.caller r0;
    gt r1 0u64 into r15;
    assert.eq r15 true;
    lte r1 1000000000000000u64 into r16;
    assert.eq r16 true;
    gte r3 r6 into r17;
    assert.eq r17 true;
    call compute_invoice_id_internal self.caller r0 r1 r3 r5 into r18;
    call compute_invoice_hash_internal self.caller r0 r1 r2 r3 r5 r7 r8 r9 r10 into r19;
    assert.eq r4 r19;
    is.neq r14.tax_tag 0field into r20;
    call compute_tax_tag r14.tax_groups into r21;
    not r20 into r22;
    is.eq r21 r14.tax_tag into r23;
    or r23 r22 into r24;
    assert.eq r24 true;
    call tax_group_valid r14.tax_groups.group_a into r25;
    or r25 r22 into r26;
    assert.eq r26 true;
    call tax_group_valid r14.tax_groups.group_b into r27;
    or r27 r22 into r28;
    assert.eq r28 true;
    call tax_groups_sum r14.tax_groups into r29;
    is.eq r29 r14.total_amount into r30;
    or r30 r22 into r31;
    assert.eq r31 true;
    add r1 r2 into r32;
    assert.eq r32 r14.total_amount;
    div r1 10000u64 into r33;
    mul r33 r13 into r34;
    is.eq r2 r34 into r35;
    is.eq r32 r12 into r36;
    is.eq r11 r1 into r37;
    is.eq r4 r19 into r38;
    call compute_rules_result r35 r17 r36 r37 r38 into r39;
    cast r1 into r40 as field;
    call commit_field r40 r5 1field into r41;
    cast r2 into r42 as field;
    call commit_field r42 r5 2field into r43;
    cast r3 into r44 as field;
    call commit_field r44 r5 3field into r45;
    cast r0 into r46 as field;
    call commit_field r46 r5 4field into r47;
    cast self.caller into r48 as field;
    call commit_field r48 r5 5field into r49;
    call commit_field r8 r5 6field into r50;
    call commit_field r9 r5 7field into r51;
    call commit_field r10 r5 8field into r52;
    call commit_field r7 r5 9field into r53;
    call commit_field r14.tax_tag r5 10field into r54;
    call commit_field r14.jct_registration r5 11field into r55;
    cast r41 r43 r45 r47 r49 r50 r51 r52 r53 r54 r55 into r56 as FieldCommitments;
    hash.bhp256 r56 into r57 as field;
    cast self.caller r18 self.caller r0 r1 r2 r4 r3 r6 0u8 r7 r8 r9 r10 r14.tax_tag r14.jct_registration r14.total_amount r14.currency_flag into r58 as InvoiceRecord.record;
    cast r0 r18 self.caller r0 r1 r2 r4 r3 r6 0u8 r7 r8 r9 r10 r14.tax_tag r14.jct_registration r14.total_amount r14.currency_flag into r59 as InvoiceRecord.record;
    async create_invoice r18 r4 self.caller r57 r56 r39 r14.tax_tag r14.jct_registration into r60;
    output r58 as InvoiceRecord.record;
    output r59 as InvoiceRecord.record;
    output r60 as zk_invoice_v3_0.aleo/create_invoice.future;

finalize create_invoice:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as address.public;
    input r3 as field.public;
    input r4 as FieldCommitments.public;
    input r5 as field.public;
    input r6 as field.public;
    input r7 as field.public;
    get.or_use invoice_registry[r0] 0field into r8;
    assert.eq r8 0field;
    set r1 into invoice_registry[r0];
    set 0u8 into invoice_status[r0];
    set r3 into invoice_commitment[r0];
    set r4 into invoice_field_commitments[r0];
    set r5 into invoice_rules_result[r0];
    set r6 into invoice_tax_tag[r0];
    set r7 into invoice_jct_reg[r0];
    get.or_use invoice_count[r2] 0u64 into r9;
    add r9 1u64 into r10;
    set r10 into invoice_count[r2];
    get.or_use audit_counter[r2] 0u64 into r11;
    add r11 1u64 into r12;
    set r12 into audit_counter[r2];

function pay_invoice_public:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as u32.private;
    input r3 as field.public;
    assert.eq self.caller r0.buyer;
    assert.eq r0.status 0u8;
    assert.eq r0.currency_flag 0u8;
    lte r2 r0.due_date into r4;
    assert.eq r4 true;
    gt r0.total_amount 0u64 into r5;
    assert.eq r5 true;
    call credits.aleo/transfer_public_as_signer r0.seller r0.total_amount into r6;
    hash.bhp256 r0.invoice_id into r7 as field;
    cast self.caller r7 r0.invoice_id self.caller r0.seller r0.total_amount r2 r3 into r8 as PaymentRecord.record;
    cast self.caller r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.currency r0.items_hash r0.memo_hash r0.tax_tag r0.jct_registration r0.total_amount r0.currency_flag into r9 as InvoiceRecord.record;
    cast r0.seller r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.currency r0.items_hash r0.memo_hash r0.tax_tag r0.jct_registration r0.total_amount r0.currency_flag into r10 as InvoiceRecord.record;
    async pay_invoice_public r0.invoice_id r3 r6 into r11;
    output r8 as PaymentRecord.record;
    output r9 as InvoiceRecord.record;
    output r10 as InvoiceRecord.record;
    output r11 as zk_invoice_v3_0.aleo/pay_invoice_public.future;

finalize pay_invoice_public:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as credits.aleo/transfer_public_as_signer.future;
    await r2;
    set 1u8 into invoice_status[r0];
    set r0 into invoice_tx_id[r1];

function pay_invoice_usdcx:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as u32.private;
    input r3 as field.public;
    assert.eq self.caller r0.buyer;
    assert.eq r0.status 0u8;
    assert.eq r0.currency_flag 1u8;
    lte r2 r0.due_date into r4;
    assert.eq r4 true;
    gt r0.total_amount 0u64 into r5;
    assert.eq r5 true;
    call usdcx_stablecoin.aleo/transfer_from_public r0.buyer r0.seller r0.total_amount into r6;
    hash.bhp256 r0.invoice_id into r7 as field;
    cast self.caller r7 r0.invoice_id self.caller r0.seller r0.total_amount r2 r3 into r8 as PaymentRecord.record;
    cast self.caller r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.currency r0.items_hash r0.memo_hash r0.tax_tag r0.jct_registration r0.total_amount r0.currency_flag into r9 as InvoiceRecord.record;
    cast r0.seller r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.currency r0.items_hash r0.memo_hash r0.tax_tag r0.jct_registration r0.total_amount r0.currency_flag into r10 as InvoiceRecord.record;
    async pay_invoice_usdcx r0.invoice_id r3 r6 into r11;
    output r8 as PaymentRecord.record;
    output r9 as InvoiceRecord.record;
    output r10 as InvoiceRecord.record;
    output r11 as zk_invoice_v3_0.aleo/pay_invoice_usdcx.future;

finalize pay_invoice_usdcx:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as usdcx_stablecoin.aleo/transfer_from_public.future;
    await r2;
    set 1u8 into invoice_status[r0];
    set r0 into invoice_tx_id[r1];

function cancel_invoice:
    input r0 as InvoiceRecord.record;
    assert.eq self.caller r0.seller;
    assert.eq r0.status 0u8;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 2u8 r0.order_id r0.currency r0.items_hash r0.memo_hash r0.tax_tag r0.jct_registration r0.total_amount r0.currency_flag into r1 as InvoiceRecord.record;
    async cancel_invoice r0.invoice_id r0.seller into r2;
    output r1 as InvoiceRecord.record;
    output r2 as zk_invoice_v3_0.aleo/cancel_invoice.future;

finalize cancel_invoice:
    input r0 as field.public;
    input r1 as address.public;
    set 2u8 into invoice_status[r0];
    get.or_use audit_counter[r1] 0u64 into r2;
    gt r2 0u64 into r3;
    branch.eq r3 false to end_then_0_0;
    sub r2 1u64 into r4;
    set r4 into audit_counter[r1];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;

function set_audit_authorization:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as u64.private;
    input r3 as u32.private;
    input r4 as u32.private;
    assert.eq self.caller r0.seller;
    gte r3 r4 into r5;
    assert.eq r5 true;
    cast r1 r2 r3 self.caller into r6 as AuditAuthorization;
    async set_audit_authorization r0.invoice_id r6 into r7;
    output r7 as zk_invoice_v3_0.aleo/set_audit_authorization.future;

finalize set_audit_authorization:
    input r0 as field.public;
    input r1 as AuditAuthorization.public;
    set r1 into audit_authorization[r0];

function compute_invoice_id:
    input r0 as address.private;
    input r1 as address.private;
    input r2 as u64.private;
    input r3 as u32.private;
    input r4 as field.private;
    call compute_invoice_id_internal r0 r1 r2 r3 r4 into r5;
    output r5 as field.private;

function compute_invoice_hash:
    input r0 as address.private;
    input r1 as address.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u32.private;
    input r5 as field.private;
    input r6 as field.private;
    input r7 as field.private;
    input r8 as field.private;
    input r9 as field.private;
    call compute_invoice_hash_internal r0 r1 r2 r3 r4 r5 r6 r7 r8 r9 into r10;
    output r10 as field.private;

function compute_tax_tag_export:
    input r0 as TaxGroups.private;
    call compute_tax_tag r0 into r1;
    output r1 as field.private;

function get_caller:
    output self.caller as address.private;

function make_jct_non_jct:
    input r0 as u64.private;
    input r1 as u8.private;
    cast 0u64 0u64 0u64 into r2 as TaxGroup;
    cast r2 r2 into r3 as TaxGroups;
    cast r3 0field r0 0field r1 into r4 as CreateInvoiceJct;
    output r4 as CreateInvoiceJct.private;

function make_jct_jct:
    input r0 as u64.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u64.private;
    input r5 as u64.private;
    input r6 as field.private;
    input r7 as u64.private;
    input r8 as field.private;
    input r9 as u8.private;
    cast r0 r1 r2 into r10 as TaxGroup;
    cast r3 r4 r5 into r11 as TaxGroup;
    cast r10 r11 into r12 as TaxGroups;
    cast r12 r6 r7 r8 r9 into r13 as CreateInvoiceJct;
    output r13 as CreateInvoiceJct.private;

function compute_tax_tag_for_test:
    input r0 as u64.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u64.private;
    input r5 as u64.private;
    cast r0 r1 r2 into r6 as TaxGroup;
    cast r3 r4 r5 into r7 as TaxGroup;
    cast r6 r7 into r8 as TaxGroups;
    call compute_tax_tag r8 into r9;
    output r9 as field.private;

function get_invoice_tax_tag:
    input r0 as field.private;
    async get_invoice_tax_tag r0 into r1;
    output r1 as zk_invoice_v3_0.aleo/get_invoice_tax_tag.future;

finalize get_invoice_tax_tag:
    input r0 as field.public;
    get.or_use invoice_tax_tag[r0] 0field into r1;
    set r1 into getter_tax_tag_cache[r0];

function get_invoice_jct_reg:
    input r0 as field.private;
    async get_invoice_jct_reg r0 into r1;
    output r1 as zk_invoice_v3_0.aleo/get_invoice_jct_reg.future;

finalize get_invoice_jct_reg:
    input r0 as field.public;
    get.or_use invoice_jct_reg[r0] 0field into r1;
    set r1 into getter_jct_reg_cache[r0];

function get_invoice_tx_id:
    input r0 as field.private;
    async get_invoice_tx_id r0 into r1;
    output r1 as zk_invoice_v3_0.aleo/get_invoice_tx_id.future;

finalize get_invoice_tx_id:
    input r0 as field.public;
    get.or_use invoice_tx_id[r0] 0field into r1;
    set r1 into getter_tx_id_cache[r0];

constructor:
    assert.eq edition 0u16;
