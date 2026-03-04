# zk_invoice_v3_1.aleo Deployment Log

- Network: testnet
- Program ID: `zk_invoice_v3_1.aleo`
- Deployment tx: `at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp`
- Fee tx: `at1l4n90s8c0g9alg8qv0qd62rlrra5zcek77hrzv0r08dkdr8atc8qzc4jdy`
- Deployed by: `aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u`
- Date: 2026-02-12 (UTC)

Build/tests before deploy:
- `leo test` (6/6) covering create, cancel, pay helper, rules anchor, tax proof, amount/ownership anchor.

Post-deploy to-dos:
- Propagate `NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v3_1.aleo` to Vercel/clients.
- Frontend/Service integration for getter caches and proof/anchor flows (pending).
