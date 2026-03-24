program zk_credit_v1.aleo;

record CreditProofToken:
    owner as address.private;
    proof_id as field.private;
    claim_hash as field.private;
    data_commitment as field.private;
    is_valid as boolean.private;
    generated_at as u32.private;
    expires_at as u32.private;

struct CreditProofInput:
    total_invoices as u64;
    paid_on_time as u64;
    total_paid_amount as u64;
    first_invoice_date as u32;
    dispute_count as u64;
    proof_generated_at as u32;

struct CreditClaim:
    claim_type as u8;
    threshold as u64;
    period_start as u32;
    period_end as u32;

mapping credit_proofs:
    key as field.public;
    value as field.public;

closure verify_claim:
    input r0 as CreditProofInput;
    input r1 as CreditClaim;
    is.eq r0.total_invoices 0u64 into r2;
    ternary r2 1u64 r0.total_invoices into r3;
    is.eq r1.claim_type 0u8 into r4;
    mul r0.paid_on_time 10000u64 into r5;
    div r5 r3 into r6;
    gt r0.total_invoices 0u64 into r7;
    gte r6 r1.threshold into r8;
    and r7 r8 into r9;
    is.eq r1.claim_type 1u8 into r10;
    gte r0.total_invoices r1.threshold into r11;
    is.eq r1.claim_type 2u8 into r12;
    gte r0.total_paid_amount r1.threshold into r13;
    is.eq r1.claim_type 3u8 into r14;
    is.eq r0.first_invoice_date 0u32 into r15;
    ternary r15 r0.proof_generated_at r0.first_invoice_date into r16;
    sub r0.proof_generated_at r16 into r17;
    cast r17 into r18 as u64;
    gt r0.first_invoice_date 0u32 into r19;
    gte r18 r1.threshold into r20;
    and r19 r20 into r21;
    is.eq r1.claim_type 4u8 into r22;
    mul r0.dispute_count 10000u64 into r23;
    div r23 r3 into r24;
    is.eq r0.total_invoices 0u64 into r25;
    lte r24 r1.threshold into r26;
    or r25 r26 into r27;
    ternary r22 r27 false into r28;
    ternary r14 r21 r28 into r29;
    ternary r12 r13 r29 into r30;
    ternary r10 r11 r30 into r31;
    ternary r4 r9 r31 into r32;
    output r32 as boolean;

function generate_credit_proof:
    input r0 as CreditProofInput.private;
    input r1 as CreditClaim.private;
    input r2 as u32.private;
    hash.bhp256 r1 into r3 as field;
    hash.bhp256 r0 into r4 as field;
    call verify_claim r0 r1 into r5;
    hash.bhp256 r4 into r6 as field;
    mul r2 86400u32 into r7;
    add r0.proof_generated_at r7 into r8;
    cast self.caller r6 r3 r4 r5 r0.proof_generated_at r8 into r9 as CreditProofToken.record;
    async generate_credit_proof r6 r3 into r10;
    output r9 as CreditProofToken.record;
    output r10 as zk_credit_v1.aleo/generate_credit_proof.future;

finalize generate_credit_proof:
    input r0 as field.public;
    input r1 as field.public;
    set r1 into credit_proofs[r0];

function verify_credit_claim:
    input r0 as field.private;
    async verify_credit_claim r0 into r1;
    output r1 as zk_credit_v1.aleo/verify_credit_claim.future;

finalize verify_credit_claim:
    input r0 as field.public;
    get.or_use credit_proofs[r0] 0field into r1;
    assert.neq r1 0field;

constructor:
    assert.eq edition 0u16;
