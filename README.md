# Alpaca Invoice

Privacy-preserving B2B invoice system on Aleo. Private Records plus public anchors (hash, commitments, rules_result, audit auth/counter) enable selective, chain-verifiable audits.

**Current contract:** `zk_invoice_v2_2.aleo` (testnet) — tx `at13cmxw90rn5xux4gj7xejyz7jlc5yc7ugkjl8hv7rdgqp4l7uwcfq87ps78`

## Features

- **Privacy-First**: Transaction amounts and party details encrypted on-chain
- **Two-Step Payment**: Secure payment flow via credits.aleo + zk_invoice_v2.aleo
- **Dual Records**: Both seller and buyer receive independent invoice records
- **Audit Support**: Off-chain selective disclosure via wallet-signed audit packages (permissioned + expiring) and shareable audit keys
- **IndexedDB Storage**: Encrypted local persistence with integrity verification

## Quick Start

### Prerequisites

- Node.js 18+
- Aleo Wallet (Leo Wallet or Puzzle Wallet)

### Installation

```bash
npm install
npm run dev
```

Visit http://localhost:3000

Optional utilities:
- Offline audit-package validator: `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`

### Configuration

Create `.env` file:

```env
NEXT_PUBLIC_ALEO_NETWORK=testnetbeta
NEXT_PUBLIC_ALEO_ADDRESS=your_aleo_address
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                     │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────────┐  │
│  │    View    │  │ Controller │  │    Service Layer      │  │
│  │ Components │◄─┤   Hooks    │◄─┤ (Wallet, Crypto, RPC) │  │
│  └────────────┘  └────────────┘  └───────────────────────┘  │
│                         │                                    │
│  ┌──────────────────────▼────────────────────────────────┐  │
│  │              Model (Zustand + IndexedDB)               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Aleo Blockchain (Testnet)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 zk_invoice_v2_2.aleo                  │  │
│  │  create_invoice | mark_as_paid | cancel_invoice       │  │
│  │  set_audit_authorization | assert_* anchors           │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   credits.aleo                         │  │
│  │  transfer_private (for payments)                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Contract Functions

| Function | Role | Description |
|----------|------|-------------|
| `create_invoice` | Seller | Create invoice (async finalize writes hash/commitments/rules_result caches) |
| `mark_as_paid` | Buyer | Mark invoice as paid (async) |
| `cancel_invoice` | Seller | Cancel pending invoice (async) |
| `set_audit_authorization` | Seller | Set audit_key_hash + scopes + expiry |
| `assert_rules_anchor` | Anyone | Assert cached rules_result |
| `assert_commitment_anchor` | Anyone | Assert commitment root |
| `assert_amount_anchor` | Anyone | Assert amount range vs record |
| `assert_ownership_anchor` | Anyone | Assert seller/buyer vs record |
| `assert_audit_counter_anchor` | Anyone | Assert seller audit counter |

## Project Structure

```
├── src/main.leo              # Smart contract
├── app/                      # Next.js pages
│   ├── dashboard/            # Dashboard
│   ├── invoices/             # Invoice management
│   ├── receipts/             # Payment receipts
│   └── audit/                # Audit Center (generate + validate audit packages)
├── components/               # React components
├── controller/               # Business logic hooks
├── services/                 # Protocol adapters
├── stores/                   # Zustand state management
└── docs/                     # Documentation
```

## Technology Stack

**Frontend**: Next.js 14, TypeScript, Tailwind CSS, Zustand, IndexedDB

**Blockchain**: Leo 3.4.0, @provablehq/sdk, @demox-labs/aleo-wallet-adapter

**Wallets**: Leo Wallet, Puzzle Wallet

## Audit Workflow (Selective Disclosure)
1. Connect a wallet that supports `signMessage`; ensure the invoice you want to disclose is decrypted locally (masterKey is derived during create/pay flows).
2. Open `/audit`, choose invoice ID, auditor address, expiry, and permissions; click **Generate** to get an audit package JSON plus a random audit key.
3. Share the JSON package + audit key to the auditor (out-of-band).
4. Auditor validates & decrypts via the UI “Validate Audit Package” panel or the offline script `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`.
5. Validation checks expiry, cipher-hash integrity, and recomputes `invoice_hash` from disclosed details; the smart contract remains unchanged.

## Testing

The project has two layers of tests:

**Smart Contract (Leo)** — Wave2 contract `zk_invoice_v2_2.aleo` with mappings/async/ZK proofs (rules, amount, ownership, commitments, audit auth/counter).

**Service Unit Tests (Vitest)** — Unit tests for core services including WalletService, CryptoService, AleoProtocolService, StorageService, InvoiceStatusValidator, PollingService, and InvoiceStore. Run with `npx vitest`.

**Linting** — `npm run lint`

### Test Documentation

- `tests/README.md` — Leo test suite overview and how-to
- `tests/TESTING_GUIDE.md` — Step-by-step testing guide
- `tests/QUICK_REFERENCE.md` — Command cheatsheet
- `tests/AUDIT_FLOW_TESTING.md` — UI + CLI audit package validation
- `services/*/__tests__/README.md` — Per-service test docs

## Deployment

- **Program ID**: `zk_invoice_v2_2.aleo` (legacy IDs only for history reads)
- **Network**: Aleo Testnet Beta
- **Deployment TX**: `at13cmxw90rn5xux4gj7xejyz7jlc5yc7ugkjl8hv7rdgqp4l7uwcfq87ps78`

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - Technical architecture and data flows
- [Business Flow](./docs/BUSINESS_FLOW.md) - Complete business logic flows
- [Audit Package API](./docs/API_AUDIT_PACKAGE.md) - v2.2 schema, scopes bitmask, examples

## License

MIT
