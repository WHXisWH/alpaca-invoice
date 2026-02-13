# zk_invoice_v2_2.aleo Deployment Log

- Network: testnet
- Program ID: `zk_invoice_v2_2.aleo`
- Deployment tx: `at13cmxw90rn5xux4gj7xejyz7jlc5yc7ugkjl8hv7rdgqp4l7uwcfq87ps78`
- Fee tx: `at1l4n90s8c0g9alg8qv0qd62rlrra5zcek77hrzv0r08dkdr8atc8qzc4jdy`
- Deployed by: `aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u`
- Date: 2026-02-12 (UTC)

Build/tests before deploy:
- `leo test` (6/6) covering create, cancel, pay helper, rules anchor, tax proof, amount/ownership anchor.

Post-deploy to-dos:
- Propagate `NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v2_2.aleo` to Vercel/clients.
- Frontend/Service integration for getter caches and proof/anchor flows (pending).
