program zk_invoice.aleo;

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

function create_invoice:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u32.private;
    input r3 as field.private;
    input r4 as field.private;
    assert.neq self.caller r0;
    gt r1 0u64 into r5;
    assert.eq r5 true;
    cast self.caller r0 r1 r2 r4 into r6 as InvoiceData;
    hash.bhp256 r6 into r7 as field;
    cast self.caller r7 self.caller r0 r1 r3 r2 0u32 0u8 into r8 as InvoiceRecord.record;
    cast r0 r7 self.caller r0 r1 r3 r2 0u32 0u8 into r9 as InvoiceRecord.record;
    output r8 as InvoiceRecord.record;
    output r9 as InvoiceRecord.record;

function verify_invoice:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    is.eq r0.invoice_hash r1 into r2;
    output r2 as boolean.private;

function mark_as_paid:
    input r0 as InvoiceRecord.record;
    input r1 as field.private;
    assert.eq self.caller r0.buyer;
    assert.eq r0.status 0u8;
    cast r0.invoice_id self.caller r0.seller r1 into r2 as PaymentData;
    hash.bhp256 r2 into r3 as field;
    cast self.caller r3 r0.invoice_id self.caller r0.seller r0.amount 0u32 into r4 as PaymentRecord.record;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.invoice_hash r0.due_date r0.created_at 1u8 into r5 as InvoiceRecord.record;
    output r4 as PaymentRecord.record;
    output r5 as InvoiceRecord.record;

function create_seller_receipt:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as address.private;
    input r3 as u64.private;
    input r4 as field.private;
    assert.eq self.caller r2;
    cast r0 r1 r2 r4 into r5 as PaymentData;
    hash.bhp256 r5 into r6 as field;
    cast self.caller r6 r0 r1 r2 r3 0u32 into r7 as PaymentRecord.record;
    output r7 as PaymentRecord.record;

function cancel_invoice:
    input r0 as InvoiceRecord.record;
    assert.eq self.caller r0.seller;
    assert.eq r0.status 0u8;
    cast r0.owner r0.invoice_id r0.seller r0.buyer r0.amount r0.invoice_hash r0.due_date r0.created_at 2u8 into r1 as InvoiceRecord.record;
    output r1 as InvoiceRecord.record;

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

constructor:
    assert.eq edition 0u16;
