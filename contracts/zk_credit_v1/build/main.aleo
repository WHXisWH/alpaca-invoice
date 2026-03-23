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
    is.eq r1.claim_type 0u8 into r2;
    is.eq r0.total_invoices 0u64 into r3;
    and r2 r3 into r4;
    mul r0.paid_on_time 10000u64 into r5;
    div r5 r0.total_invoices into r6;
    gte r6 r1.threshold into r7;
    is.eq r1.claim_type 1u8 into r8;
    gte r0.total_invoices r1.threshold into r9;
    is.eq r1.claim_type 2u8 into r10;
    gte r0.total_paid_amount r1.threshold into r11;
    is.eq r1.claim_type 3u8 into r12;
    sub r0.proof_generated_at r0.first_invoice_date into r13;
    cast r13 into r14 as u64;
    gte r14 r1.threshold into r15;
    is.eq r1.claim_type 4u8 into r16;
    is.eq r0.total_invoices 0u64 into r17;
    and r16 r17 into r18;
    mul r0.dispute_count 10000u64 into r19;
    div r19 r0.total_invoices into r20;
    lte r20 r1.threshold into r21;
    ternary r16 r21 false into r22;
    ternary r18 true r22 into r23;
    ternary r12 r15 r23 into r24;
    ternary r10 r11 r24 into r25;
    ternary r8 r9 r25 into r26;
    ternary r2 r7 r26 into r27;
    ternary r4 false r27 into r28;
    output r28 as boolean;

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
