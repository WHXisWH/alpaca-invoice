import credits.aleo;
program zk_invoice_v4.aleo;

record DisputeRecord:
    owner as address.private;
    dispute_id as field.private;
    invoice_id as field.private;
    disputant as address.private;
    arbiter as address.private;
    reason_hash as field.private;
    evidence_hash as field.private;
    status as u8.private;
    created_at as u32.private;
    resolution_deadline as u32.private;

record EscrowRecord:
    owner as address.private;
    escrow_id as field.private;
    invoice_id as field.private;
    payer as address.private;
    payee as address.private;
    amount as u64.private;
    currency_flag as u8.private;
    delivery_deadline as u32.private;
    arbiter as address.private;
    status as u8.private;

record PaymentRecord:
    owner as address.private;
    payment_id as field.private;
    invoice_id as field.private;
    payer as address.private;
    payee as address.private;
    amount as u64.private;
    paid_at as u32.private;
    settlement_anchor as field.private;

struct DisputeData:
    invoice_id as field;
    disputant as address;
    arbiter as address;
    reason_hash as field;
    evidence_hash as field;
    created_at as u32;
    resolution_deadline as u32;

struct EscrowData:
    invoice_id as field;
    payer as address;
    payee as address;
    amount as u64;
    delivery_deadline as u32;
    arbiter as address;

struct PaymentCommitData:
    invoice_id as field;
    amount as u64;
    nonce as field;

mapping dispute_registry:
    key as field.public;
    value as field.public;

mapping dispute_status:
    key as field.public;
    value as u8.public;

mapping dispute_resolution:
    key as field.public;
    value as field.public;

mapping escrow_registry:
    key as field.public;
    value as field.public;

mapping escrow_status:
    key as field.public;
    value as u8.public;

mapping escrow_balances:
    key as field.public;
    value as u64.public;

mapping invoice_status:
    key as field.public;
    value as u8.public;

mapping payment_commitments:
    key as field.public;
    value as field.public;

function raise_dispute:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as address.private;
    input r3 as address.private;
    input r4 as address.private;
    input r5 as field.private;
    input r6 as field.private;
    input r7 as u32.private;
    input r8 as u32.private;
    assert.eq self.caller r2;
    assert.eq r1 0u8;
    gt r8 r7 into r9;
    assert.eq r9 true;
    cast r0 self.caller r4 r5 r6 r7 r8 into r10 as DisputeData;
    hash.bhp256 r10 into r11 as field;
    cast self.caller r11 r0 self.caller r4 r5 r6 0u8 r7 r8 into r12 as DisputeRecord.record;
    cast r3 r11 r0 self.caller r4 r5 r6 0u8 r7 r8 into r13 as DisputeRecord.record;
    cast r4 r11 r0 self.caller r4 r5 r6 0u8 r7 r8 into r14 as DisputeRecord.record;
    async raise_dispute r0 r11 into r15;
    output r12 as DisputeRecord.record;
    output r13 as DisputeRecord.record;
    output r14 as DisputeRecord.record;
    output r15 as zk_invoice_v4.aleo/raise_dispute.future;

finalize raise_dispute:
    input r0 as field.public;
    input r1 as field.public;
    get.or_use invoice_status[r0] 0u8 into r2;
    assert.eq r2 0u8;
    gt block.height 0u32 into r3;
    assert.eq r3 true;
    set 4u8 into invoice_status[r0];
    set r1 into dispute_registry[r0];
    set 0u8 into dispute_status[r1];

function resolve_dispute:
    input r0 as DisputeRecord.record;
    input r1 as u8.private;
    input r2 as field.private;
    assert.eq self.caller r0.arbiter;
    assert.eq r0.status 0u8;
    is.eq r1 1u8 into r3;
    is.eq r1 2u8 into r4;
    or r3 r4 into r5;
    assert.eq r5 true;
    ternary r4 6u8 5u8 into r6;
    async resolve_dispute r0.dispute_id r0.invoice_id r1 r6 r2 into r7;
    output r7 as zk_invoice_v4.aleo/resolve_dispute.future;

finalize resolve_dispute:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as u8.public;
    input r4 as field.public;
    get.or_use dispute_status[r0] 0u8 into r5;
    assert.eq r5 0u8;
    set r2 into dispute_status[r0];
    set r3 into invoice_status[r1];
    set r4 into dispute_resolution[r0];

function submit_evidence:
    input r0 as DisputeRecord.record;
    input r1 as field.private;
    is.eq self.caller r0.disputant into r2;
    is.eq self.caller r0.arbiter into r3;
    or r2 r3 into r4;
    assert.eq r4 true;
    assert.eq r0.status 0u8;
    cast self.caller r0.dispute_id r0.invoice_id r0.disputant r0.arbiter r0.reason_hash r1 0u8 r0.created_at r0.resolution_deadline into r5 as DisputeRecord.record;
    async submit_evidence r0.dispute_id into r6;
    output r5 as DisputeRecord.record;
    output r6 as zk_invoice_v4.aleo/submit_evidence.future;

finalize submit_evidence:
    input r0 as field.public;
    get.or_use dispute_status[r0] 0u8 into r1;
    assert.eq r1 0u8;

function escrow_payment_credits:
    input r0 as credits.aleo/credits.record;
    input r1 as field.private;
    input r2 as address.private;
    input r3 as u64.private;
    input r4 as u32.private;
    input r5 as address.private;
    input r6 as u32.private;
    gt r3 0u64 into r7;
    assert.eq r7 true;
    lte r3 1000000000000000u64 into r8;
    assert.eq r8 true;
    gt r4 r6 into r9;
    assert.eq r9 true;
    call credits.aleo/transfer_private_to_public r0 zk_invoice_v4.aleo r3 into r10 r11;
    cast r1 self.caller r2 r3 r4 r5 into r12 as EscrowData;
    hash.bhp256 r12 into r13 as field;
    cast self.caller r13 r1 self.caller r2 r3 0u8 r4 r5 0u8 into r14 as EscrowRecord.record;
    cast r2 r13 r1 self.caller r2 r3 0u8 r4 r5 0u8 into r15 as EscrowRecord.record;
    async escrow_payment_credits r11 r1 r13 r3 into r16;
    output r10 as credits.aleo/credits.record;
    output r14 as EscrowRecord.record;
    output r15 as EscrowRecord.record;
    output r16 as zk_invoice_v4.aleo/escrow_payment_credits.future;

finalize escrow_payment_credits:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u64.public;
    await r0;
    set 7u8 into invoice_status[r1];
    set r2 into escrow_registry[r1];
    set 0u8 into escrow_status[r2];
    set r3 into escrow_balances[r2];

function confirm_delivery:
    input r0 as EscrowRecord.record;
    input r1 as field.private;
    input r2 as u32.private;
    is.eq self.caller r0.payer into r3;
    is.eq self.caller r0.arbiter into r4;
    or r3 r4 into r5;
    assert.eq r5 true;
    assert.eq r0.status 0u8;
    call credits.aleo/transfer_public_to_private r0.payee r0.amount into r6 r7;
    cast r0.invoice_id r0.amount r1 into r8 as PaymentCommitData;
    hash.bhp256 r8 into r9 as field;
    hash.bhp256 r0.invoice_id into r10 as field;
    cast r0.payer r10 r0.invoice_id r0.payer r0.payee r0.amount r2 r9 into r11 as PaymentRecord.record;
    async confirm_delivery r7 r0.invoice_id r0.escrow_id r9 into r12;
    output r6 as credits.aleo/credits.record;
    output r11 as PaymentRecord.record;
    output r12 as zk_invoice_v4.aleo/confirm_delivery.future;

finalize confirm_delivery:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as field.public;
    await r0;
    get.or_use escrow_status[r2] 0u8 into r4;
    assert.eq r4 0u8;
    set 1u8 into escrow_status[r2];
    set 0u64 into escrow_balances[r2];
    set 1u8 into invoice_status[r1];
    set r1 into payment_commitments[r3];

function timeout_refund:
    input r0 as EscrowRecord.record;
    input r1 as u32.private;
    is.eq self.caller r0.payer into r2;
    is.eq self.caller r0.arbiter into r3;
    or r2 r3 into r4;
    assert.eq r4 true;
    assert.eq r0.status 0u8;
    gt r1 r0.delivery_deadline into r5;
    assert.eq r5 true;
    call credits.aleo/transfer_public_to_private r0.payer r0.amount into r6 r7;
    async timeout_refund r7 r0.invoice_id r0.escrow_id r0.delivery_deadline into r8;
    output r6 as credits.aleo/credits.record;
    output r8 as zk_invoice_v4.aleo/timeout_refund.future;

finalize timeout_refund:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u32.public;
    await r0;
    get.or_use escrow_status[r2] 0u8 into r4;
    assert.eq r4 0u8;
    div r3 5u32 into r5;
    gt block.height r5 into r6;
    assert.eq r6 true;
    set 2u8 into escrow_status[r2];
    set 0u64 into escrow_balances[r2];
    set 8u8 into invoice_status[r1];

constructor:
    assert.eq edition 0u16;
