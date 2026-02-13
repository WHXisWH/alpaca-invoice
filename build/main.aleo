program zk_invoice_v2_2.aleo;

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

record PaymentRecord:
    owner as address.private;
    payment_id as field.private;
    invoice_id as field.private;
    payer as address.private;
    payee as address.private;
    amount as u64.private;
    paid_at as u32.private;

struct InvoiceData:
    seller as address;
    buyer as address;
    amount as u64;
    due_date as u32;
    invoice_number as field;

struct PaymentData:
    invoice_id as field;
    payer as address;
    payee as address;
    payment_nonce as field;

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
    assert.neq self.caller r0;
    gt r1 0u64 into r14;
    assert.eq r14 true;
    gte r3 r6 into r15;
    assert.eq r15 true;
    call compute_invoice_id_internal self.caller r0 r1 r3 r5 into r16;
    call compute_invoice_hash_internal self.caller r0 r1 r2 r3 r5 r7 r8 r9 r10 into r17;
    assert.eq r4 r17;
    mul r1 r13 into r18;
    div r18 10000u64 into r19;
    is.eq r2 r19 into r20;
    add r1 r2 into r21;
    is.eq r21 r12 into r22;
    is.eq r11 r1 into r23;
    is.eq r4 r17 into r24;
    call compute_rules_result r20 r15 r22 r23 r24 into r25;
    cast r1 into r26 as field;
    call commit_field r26 r5 1field into r27;
    cast r2 into r28 as field;
    call commit_field r28 r5 2field into r29;
    cast r3 into r30 as field;
    call commit_field r30 r5 3field into r31;
    cast r0 into r32 as field;
    call commit_field r32 r5 4field into r33;
    cast self.caller into r34 as field;
    call commit_field r34 r5 5field into r35;
    call commit_field r8 r5 6field into r36;
    call commit_field r9 r5 7field into r37;
    call commit_field r10 r5 8field into r38;
    call commit_field r7 r5 9field into r39;
    cast r27 r29 r31 r33 r35 r36 r37 r38 r39 into r40 as FieldCommitments;
    hash.bhp256 r40 into r41 as field;
    cast self.caller r16 self.caller r0 r1 r2 r4 r3 r6 0u8 r7 r8 r9 r10 into r42 as InvoiceRecord.record;
    cast r0 r16 self.caller r0 r1 r2 r4 r3 r6 0u8 r7 r8 r9 r10 into r43 as InvoiceRecord.record;
    async create_invoice r16 r4 self.caller r41 r40 r25 into r44;
    output r42 as InvoiceRecord.record;
    output r43 as InvoiceRecord.record;
    output r44 as zk_invoice_v2_2.aleo/create_invoice.future;

finalize create_invoice:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as address.public;
    input r3 as field.public;
    input r4 as FieldCommitments.public;
    input r5 as field.public;
    get.or_use invoice_registry[r0] 0field into r6;
    assert.eq r6 0field;
    set r1 into invoice_registry[r0];
    set 0u8 into invoice_status[r0];
    set r3 into invoice_commitment[r0];
    set r4 into invoice_field_commitments[r0];
    set r5 into invoice_rules_result[r0];
    get.or_use invoice_count[r2] 0u64 into r7;
    add r7 1u64 into r8;
    set r8 into invoice_count[r2];
    get.or_use audit_counter[r2] 0u64 into r9;
    add r9 1u64 into r10;
    set r10 into audit_counter[r2];

function mark_as_paid:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as u32.private;
    assert.eq self.caller r0.buyer;
    assert.eq r0.status 0u8;
    lte r2 r0.due_date into r3;
    assert.eq r3 true;
    cast r0.invoice_id self.caller r0.seller r1 into r4 as PaymentData;
    hash.bhp256 r4 into r5 as field;
    cast self.caller r5 r0.invoice_id self.caller r0.seller r0.amount r2 into r6 as PaymentRecord.record;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.currency r0.items_hash r0.memo_hash into r7 as InvoiceRecord.record;
    async mark_as_paid r0.invoice_id into r8;
    output r6 as PaymentRecord.record;
    output r7 as InvoiceRecord.record;
    output r8 as zk_invoice_v2_2.aleo/mark_as_paid.future;

finalize mark_as_paid:
    input r0 as field.public;
    set 1u8 into invoice_status[r0];

function cancel_invoice:
    input r0 as InvoiceRecord.record;
    assert.eq self.caller r0.seller;
    assert.eq r0.status 0u8;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 2u8 r0.order_id r0.currency r0.items_hash r0.memo_hash into r1 as InvoiceRecord.record;
    async cancel_invoice r0.invoice_id r0.seller into r2;
    output r1 as InvoiceRecord.record;
    output r2 as zk_invoice_v2_2.aleo/cancel_invoice.future;

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
    output r7 as zk_invoice_v2_2.aleo/set_audit_authorization.future;

finalize set_audit_authorization:
    input r0 as field.public;
    input r1 as AuditAuthorization.public;
    set r1 into audit_authorization[r0];

function verify_invoice_hash:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    is.eq r0.invoice_hash r1 into r2;
    output r2 as boolean.private;

function verify_payment:
    input r0 as PaymentRecord.record;
    input r1 as InvoiceRecord.record;
    is.eq r0.invoice_id r1.invoice_id into r2;
    is.eq r0.amount r1.amount into r3;
    is.eq r0.payer r1.buyer into r4;
    is.eq r0.payee r1.seller into r5;
    and r4 r5 into r6;
    and r2 r3 into r7;
    and r7 r6 into r8;
    output r8 as boolean.private;

function prove_tax_compliance:
    input r0 as InvoiceRecord.record;
    input r1 as u64.private;
    mul r0.amount r1 into r2;
    div r2 10000u64 into r3;
    is.eq r0.tax_amount r3 into r4;
    output r4 as boolean.private;

function prove_amount_in_range:
    input r0 as InvoiceRecord.record;
    input r1 as u64.private;
    input r2 as u64.private;
    gte r0.amount r1 into r3;
    lte r0.amount r2 into r4;
    and r3 r4 into r5;
    output r5 as boolean.private;

function prove_invoice_ownership:
    input r0 as InvoiceRecord.record;
    input r1 as address.private;
    input r2 as address.private;
    is.eq r0.seller r1 into r3;
    is.eq r0.buyer r2 into r4;
    and r3 r4 into r5;
    output r5 as boolean.private;

function assert_amount_anchor:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as u64.private;
    input r3 as u64.private;
    is.eq r0.invoice_hash r1 into r4;
    assert.eq r4 true;
    gte r0.amount r2 into r5;
    assert.eq r5 true;
    lte r0.amount r3 into r6;
    assert.eq r6 true;
    async assert_amount_anchor r0.invoice_id r1 into r7;
    output r7 as zk_invoice_v2_2.aleo/assert_amount_anchor.future;

finalize assert_amount_anchor:
    input r0 as field.public;
    input r1 as field.public;
    get.or_use invoice_registry[r0] 0field into r2;
    assert.eq r2 r1;

function assert_ownership_anchor:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as address.private;
    input r3 as address.private;
    is.eq r0.invoice_hash r1 into r4;
    assert.eq r4 true;
    is.eq r0.seller r2 into r5;
    assert.eq r5 true;
    is.eq r0.buyer r3 into r6;
    assert.eq r6 true;
    async assert_ownership_anchor r0.invoice_id r1 into r7;
    output r7 as zk_invoice_v2_2.aleo/assert_ownership_anchor.future;

finalize assert_ownership_anchor:
    input r0 as field.public;
    input r1 as field.public;
    get.or_use invoice_registry[r0] 0field into r2;
    assert.eq r2 r1;

function compute_rules_proof:
    input r0 as InvoiceRecord.record;
    input r1 as u32.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u64.private;
    input r5 as field.private;
    mul r0.amount r4 into r6;
    div r6 10000u64 into r7;
    is.eq r0.tax_amount r7 into r8;
    gte r0.due_date r1 into r9;
    add r0.amount r0.tax_amount into r10;
    is.eq r10 r3 into r11;
    is.eq r2 r0.amount into r12;
    is.eq r0.invoice_hash r5 into r13;
    call compute_rules_result r8 r9 r11 r12 r13 into r14;
    output r14 as field.private;

function assert_rules_anchor:
    input r0 as field.private;
    input r1 as field.private;
    async assert_rules_anchor r0 r1 into r2;
    output r2 as zk_invoice_v2_2.aleo/assert_rules_anchor.future;

finalize assert_rules_anchor:
    input r0 as field.public;
    input r1 as field.public;
    get.or_use invoice_rules_result[r0] 0field into r2;
    assert.eq r2 r1;

function create_seller_receipt:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as address.private;
    input r3 as u64.private;
    input r4 as field.private;
    input r5 as u32.private;
    assert.eq self.caller r2;
    cast r0 r1 r2 r4 into r6 as PaymentData;
    hash.bhp256 r6 into r7 as field;
    cast self.caller r7 r0 r1 r2 r3 r5 into r8 as PaymentRecord.record;
    output r8 as PaymentRecord.record;

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

function get_caller:
    output self.caller as address.private;

function get_invoice_commitment:
    input r0 as field.private;
    async get_invoice_commitment r0 into r1;
    output r1 as zk_invoice_v2_2.aleo/get_invoice_commitment.future;

finalize get_invoice_commitment:
    input r0 as field.public;
    get.or_use invoice_commitment[r0] 0field into r1;
    set r1 into getter_commitment_cache[r0];

function get_invoice_field_commitments:
    input r0 as field.private;
    async get_invoice_field_commitments r0 into r1;
    output r1 as zk_invoice_v2_2.aleo/get_invoice_field_commitments.future;

finalize get_invoice_field_commitments:
    input r0 as field.public;
    cast 0field 0field 0field 0field 0field 0field 0field 0field 0field into r1 as FieldCommitments;
    get.or_use invoice_field_commitments[r0] r1 into r2;
    set r2 into getter_field_commitments_cache[r0];

function get_rules_result:
    input r0 as field.private;
    async get_rules_result r0 into r1;
    output r1 as zk_invoice_v2_2.aleo/get_rules_result.future;

finalize get_rules_result:
    input r0 as field.public;
    get.or_use invoice_rules_result[r0] 0field into r1;
    set r1 into getter_rules_cache[r0];

function get_audit_authorization:
    input r0 as field.private;
    async get_audit_authorization r0 into r1;
    output r1 as zk_invoice_v2_2.aleo/get_audit_authorization.future;

finalize get_audit_authorization:
    input r0 as field.public;
    cast 0field 0u64 0u32 aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc into r1 as AuditAuthorization;
    get.or_use audit_authorization[r0] r1 into r2;
    set r2 into getter_auth_cache[r0];

function get_audit_counter:
    input r0 as address.private;
    async get_audit_counter r0 into r1;
    output r1 as zk_invoice_v2_2.aleo/get_audit_counter.future;

finalize get_audit_counter:
    input r0 as address.public;
    get.or_use audit_counter[r0] 0u64 into r1;
    set r1 into getter_counter_cache[r0];

function assert_commitment_anchor:
    input r0 as field.private;
    input r1 as field.private;
    async assert_commitment_anchor r0 r1 into r2;
    output r2 as zk_invoice_v2_2.aleo/assert_commitment_anchor.future;

finalize assert_commitment_anchor:
    input r0 as field.public;
    input r1 as field.public;
    get.or_use invoice_commitment[r0] 0field into r2;
    assert.eq r2 r1;

function assert_field_commitments_anchor:
    input r0 as field.private;
    input r1 as field.private;
    async assert_field_commitments_anchor r0 r1 into r2;
    output r2 as zk_invoice_v2_2.aleo/assert_field_commitments_anchor.future;

finalize assert_field_commitments_anchor:
    input r0 as field.public;
    input r1 as field.public;
    cast 0field 0field 0field 0field 0field 0field 0field 0field 0field into r2 as FieldCommitments;
    get.or_use invoice_field_commitments[r0] r2 into r3;
    hash.bhp256 r3 into r4 as field;
    assert.eq r4 r1;

function assert_audit_auth_anchor:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u64.private;
    input r3 as u32.private;
    async assert_audit_auth_anchor r0 r1 r2 r3 into r4;
    output r4 as zk_invoice_v2_2.aleo/assert_audit_auth_anchor.future;

finalize assert_audit_auth_anchor:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u64.public;
    input r3 as u32.public;
    cast 0field 0u64 0u32 aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc into r4 as AuditAuthorization;
    get.or_use audit_authorization[r0] r4 into r5;
    assert.eq r5.audit_key_hash r1;
    assert.eq r5.scopes_bitmask r2;
    assert.eq r5.expires_at r3;

function assert_audit_counter_anchor:
    input r0 as address.private;
    input r1 as u64.private;
    async assert_audit_counter_anchor r0 r1 into r2;
    output r2 as zk_invoice_v2_2.aleo/assert_audit_counter_anchor.future;

finalize assert_audit_counter_anchor:
    input r0 as address.public;
    input r1 as u64.public;
    get.or_use audit_counter[r0] 0u64 into r2;
    assert.eq r2 r1;

function test_mark_as_paid_with_payer:
    input r0 as InvoiceRecord.record;
    input r1 as address.private;
    input r2 as field.private;
    input r3 as u32.private;
    assert.eq r1 r0.buyer;
    assert.eq r0.status 0u8;
    lte r3 r0.due_date into r4;
    assert.eq r4 true;
    cast r0.invoice_id r1 r0.seller r2 into r5 as PaymentData;
    hash.bhp256 r5 into r6 as field;
    cast r1 r6 r0.invoice_id r1 r0.seller r0.amount r3 into r7 as PaymentRecord.record;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.tax_amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.currency r0.items_hash r0.memo_hash into r8 as InvoiceRecord.record;
    async test_mark_as_paid_with_payer r0.invoice_id into r9;
    output r7 as PaymentRecord.record;
    output r8 as InvoiceRecord.record;
    output r9 as zk_invoice_v2_2.aleo/test_mark_as_paid_with_payer.future;

finalize test_mark_as_paid_with_payer:
    input r0 as field.public;
    set 1u8 into invoice_status[r0];

constructor:
    assert.eq edition 0u16;
