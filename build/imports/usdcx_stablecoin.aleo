program usdcx_stablecoin.aleo;

function transfer_from_public:
    input r0 as address.private;
    input r1 as address.private;
    input r2 as u64.private;
    async transfer_from_public r0 r1 r2 into r3;
    output r3 as usdcx_stablecoin.aleo/transfer_from_public.future;

finalize transfer_from_public:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as u64.public;
    assert.eq true true;
