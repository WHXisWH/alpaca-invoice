program zk_invoice_v2.aleo;

record InvoiceRecord:
    owner as address.private;
    invoice_id as field.private;
    seller as address.private;
    buyer as address.private;
    amount as u64.private;
    invoice_hash as field.private;
    due_date as u32.private;
    created_at as u32.private;
    status as u8.private;
    order_id as field.private;
    tax_amount as u64.private;

record PaymentRecord:
    owner as address.private;
    payment_id as field.private;
    invoice_id as field.private;
    payer as address.private;
    payee as address.private;
    amount as u64.private;
    paid_at as u32.private;

record AuditReport:
    owner as address.private;
    invoice_id as field.private;
    audit_type as u8.private;
    result as boolean.private;
    audited_at as u32.private;
    auditor as address.private;

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

mapping invoice_registry:
    key as field.public;
    value as field.public;

mapping invoice_status:
    key as field.public;
    value as u8.public;

mapping invoice_count:
    key as address.public;
    value as u64.public;

function create_invoice:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u32.private;
    input r3 as field.private;
    input r4 as field.private;
    input r5 as u32.private;
    input r6 as field.private;
    input r7 as u64.private;
    assert.neq self.caller r0;
    gt r1 0u64 into r8;
    assert.eq r8 true;
    cast self.caller r0 r1 r2 r4 into r9 as InvoiceData;
    hash.bhp256 r9 into r10 as field;
    cast self.caller r10 self.caller r0 r1 r3 r2 r5 0u8 r6 r7 into r11 as InvoiceRecord.record;
    cast r0 r10 self.caller r0 r1 r3 r2 r5 0u8 r6 r7 into r12 as InvoiceRecord.record;
    async create_invoice r10 r3 self.caller into r13;
    output r11 as InvoiceRecord.record;
    output r12 as InvoiceRecord.record;
    output r13 as zk_invoice_v2.aleo/create_invoice.future;

finalize create_invoice:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as address.public;
    set r1 into invoice_registry[r0];
    set 0u8 into invoice_status[r0];
    get.or_use invoice_count[r2] 0u64 into r3;
    add r3 1u64 into r4;
    set r4 into invoice_count[r2];

function mark_as_paid:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    input r2 as u32.private;
    assert.eq self.caller r0.buyer;
    assert.eq r0.status 0u8;
    cast r0.invoice_id self.caller r0.seller r1 into r3 as PaymentData;
    hash.bhp256 r3 into r4 as field;
    cast self.caller r4 r0.invoice_id self.caller r0.seller r0.amount r2 into r5 as PaymentRecord.record;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.invoice_hash r0.due_date r0.created_at 1u8 r0.order_id r0.tax_amount into r6 as InvoiceRecord.record;
    async mark_as_paid r0.invoice_id into r7;
    output r5 as PaymentRecord.record;
    output r6 as InvoiceRecord.record;
    output r7 as zk_invoice_v2.aleo/mark_as_paid.future;

finalize mark_as_paid:
    input r0 as field.public;
    set 1u8 into invoice_status[r0];

function cancel_invoice:
    input r0 as InvoiceRecord.record;
    assert.eq self.caller r0.seller;
    assert.eq r0.status 0u8;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.invoice_hash r0.due_date r0.created_at 2u8 r0.order_id r0.tax_amount into r1 as InvoiceRecord.record;
    async cancel_invoice r0.invoice_id into r2;
    output r1 as InvoiceRecord.record;
    output r2 as zk_invoice_v2.aleo/cancel_invoice.future;

finalize cancel_invoice:
    input r0 as field.public;
    set 2u8 into invoice_status[r0];

function verify_invoice:
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
    cast r0 r1 r2 r3 r4 into r5 as InvoiceData;
    hash.bhp256 r5 into r6 as field;
    output r6 as field.private;

function prove_tax_compliance:
    input r0 as InvoiceRecord.record;
    input r1 as u64.public;
    input r2 as u64.private;
    mul r0.amount r1 into r3;
    div r3 10000u64 into r4;
    is.eq r2 r4 into r5;
    output r5 as boolean.private;

function prove_amount_in_range:
    input r0 as InvoiceRecord.record;
    input r1 as u64.public;
    input r2 as u64.public;
    gte r0.amount r1 into r3;
    lte r0.amount r2 into r4;
    and r3 r4 into r5;
    output r5 as boolean.private;

function prove_invoice_ownership:
    input r0 as InvoiceRecord.record;
    is.eq self.caller r0.seller into r1;
    is.eq self.caller r0.buyer into r2;
    or r1 r2 into r3;
    async prove_invoice_ownership r0.invoice_id r0.invoice_hash into r4;
    output r3 as boolean.private;
    output r4 as zk_invoice_v2.aleo/prove_invoice_ownership.future;

finalize prove_invoice_ownership:
    input r0 as field.public;
    input r1 as field.public;
    get invoice_registry[r0] into r2;
    assert.eq r2 r1;

function submit_audit_report:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as boolean.private;
    input r3 as u32.private;
    cast self.caller r0 r1 r2 r3 self.caller into r4 as AuditReport.record;
    async submit_audit_report r0 self.caller into r5;
    output r4 as AuditReport.record;
    output r5 as zk_invoice_v2.aleo/submit_audit_report.future;

finalize submit_audit_report:
    input r0 as field.public;
    input r1 as address.public;
    assert.eq true true;

constructor:
    assert.eq edition 0u16;
