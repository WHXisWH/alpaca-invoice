# Alpaca Invoice

Privacy-preserving B2B invoice and payment system built on Aleo blockchain. Uses zero-knowledge proofs to protect transaction privacy while supporting audit capabilities.

## Features

- **Privacy-First**: Transaction amounts and party details encrypted on-chain
- **Two-Step Payment**: Secure payment flow via credits.aleo + zk_invoice.aleo
- **Dual Records**: Both seller and buyer receive independent invoice records
- **Audit Support**: Selective disclosure via View Keys and Audit Keys
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

### Configuration

Create `.env` file:

```env
NEXT_PUBLIC_ALEO_NETWORK=testnet
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
│  │                  zk_invoice.aleo                       │  │
│  │  create_invoice | mark_as_paid | cancel_invoice       │  │
│  │  verify_invoice | verify_payment | create_seller_receipt│ │
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
| `create_invoice` | Seller | Create invoice, returns 2 InvoiceRecords |
| `mark_as_paid` | Buyer | Mark invoice as paid, returns PaymentRecord |
| `cancel_invoice` | Seller | Cancel pending invoice |
| `verify_invoice` | Anyone | Verify invoice hash integrity |
| `verify_payment` | Anyone | Verify payment matches invoice |
| `create_seller_receipt` | Seller | Generate seller receipt |

## Project Structure

```
├── src/main.leo              # Smart contract
├── app/                      # Next.js pages
│   ├── dashboard/            # Dashboard
│   ├── invoices/             # Invoice management
│   ├── receipts/             # Payment receipts
│   └── audit/                # Audit center
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

## Deployment

- **Program ID**: `zk_invoice.aleo`
- **Network**: Aleo Testnet
- **Deployment TX**: `at19wjr8krkxg33ykjmhunrufzrmk53n2r6qew9ynznu9mzldvmg5xqyayedc`

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - Technical architecture and data flows
- [Business Flow](./docs/BUSINESS_FLOW.md) - Complete business logic flows
- [PRD & TDD](./docs/PRD&TDD.md) - Product requirements and technical design

## License

MIT
