# Deployment Guide (zk_invoice_v2_2.aleo)

## Prereqs
- Leo 3.4+ toolchain
- `.env` populated with `ALEO_PRIVATE_KEY`, `ALEO_ADDRESS`, `ALEO_NETWORK=testnetbeta` (or target net)
- Program id target: `zk_invoice_v2_2.aleo`

## Steps
1) Compile & test
```bash
leo test
```
2) Deploy
```bash
leo deploy
```
Record the tx hash (e.g., `at13cmxw90rn5xux4gj7xejyz7jlc5yc7ugkjl8hv7rdgqp4l7uwcfq87ps78`).

3) Update env
```
NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v2_2.aleo
```
Propagate to Vercel/CI secrets.

4) Post-deploy verification
- Query mappings: `getter_commitment_cache`, `getter_rules_cache`, `getter_auth_cache`, `getter_counter_cache` for a known invoice_id/seller.
- Run app smoke: create → audit package → verify → pay → cancel (on testnet).

5) Rollback
- Keep previous program ID (v2_1 or legacy) in env as `NEXT_PUBLIC_LEGACY_PROGRAM_ID`.
- If regression, switch env back and redeploy frontend; contract state remains on old program.
