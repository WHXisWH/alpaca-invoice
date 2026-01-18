# ZK-Invoice

Privacy-preserving invoice and payment system built on Aleo blockchain. Uses zero-knowledge proofs to protect transaction privacy while supporting audit capabilities.

## Quick Start

### Prerequisites
- Node.js 18+
- Leo CLI 3.4.0 (for contract development)
- snarkOS 4.4.0 (for contract deployment)
- Aleo Wallet (Leo Wallet / Puzzle Wallet)

### Installation
```bash
npm install
```

### Configuration
Create `.env` file (see `.env.example` for template):
```env
# Required for frontend deployment
NEXT_PUBLIC_ALEO_NETWORK=testnet
NEXT_PUBLIC_ALEO_ADDRESS=your_aleo_address

# Optional (only for local Leo CLI operations)
ALEO_PRIVATE_KEY=your_private_key
ALEO_VIEW_KEY=your_view_key
```

### Development
```bash
npm run dev
```
Visit http://localhost:3000

### Deployment
Deploy to Vercel with environment variables:
- `NEXT_PUBLIC_ALEO_NETWORK=testnet`
- `NEXT_PUBLIC_ALEO_ADDRESS=your_aleo_address`

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│              Frontend (Next.js 14)                  │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │
│  │   UI     │  │  Zustand │  │ Wallet Adapter  │  │
│  │Components│◄─┤  Stores  │◄─┤  (@demox-labs)  │  │
│  └──────────┘  └──────────┘  └─────────────────┘  │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│           Aleo Blockchain (Testnet)                 │
│  ┌───────────────────────────────────────────────┐  │
│  │        zk_invoice.aleo Program                │  │
│  │  - create_invoice                             │  │
│  │  - mark_as_paid                               │  │
│  │  - cancel_invoice                             │  │
│  │  - verify_invoice / verify_payment            │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │        credits.aleo Program                   │  │
│  │  - transfer_private (for payments)            │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**📖 [View Detailed Architecture](./docs/ARCHITECTURE.md)**

## Business Flow

### Invoice Creation & Payment Flow

```
┌─────────┐                                    ┌─────────┐
│ Seller  │                                    │  Buyer  │
└────┬────┘                                    └────┬────┘
     │                                              │
     │ 1. Create Invoice                            │
     ├─────────────────────────────────────────────►│
     │    (InvoiceRecord x2: seller + buyer)        │
     │                                              │
     │                                              │ 2. Verify Invoice
     │                                              │    (optional)
     │                                              │
     │                                              │ 3. Transfer Credits
     │                                              │    via credits.aleo
     │                                              │
     │                                              │ 4. Mark as Paid
     │◄─────────────────────────────────────────────┤
     │    (Updated InvoiceRecord + PaymentRecord)   │
     │                                              │
     │ 5. Both parties have receipt                 │
     │                                              │
     ▼                                              ▼
┌─────────┐                                    ┌─────────┐
│ Receipt │                                    │ Receipt │
└─────────┘                                    └─────────┘
```

### Invoice Status Lifecycle

```
  ┌─────────┐
  │ PENDING │ ◄─── Initial state after creation
  └────┬────┘
       │
   ┌───┴────┐
   │        │
   ▼        ▼
┌──────┐  ┌───────────┐
│ PAID │  │ CANCELLED │ (seller only)
└──────┘  └───────────┘
   │        │
   └────┬───┘
        │
        ▼
   ┌─────────┐
   │ EXPIRED │ (time-based)
   └─────────┘
```

**📖 [View Detailed Business Flows](./docs/BUSINESS_FLOW.md)**

## Technology Stack

### Smart Contract
- **Leo 3.4.0** - Aleo smart contract language
- **Record-based Architecture** - Pure Record model (no async/finalize/mappings)
- **BHP256** - Hash algorithm for generating unique IDs

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS with amber/yellow theme
- **Zustand** - Lightweight state management
- **@demox-labs/aleo-wallet-adapter** - Wallet integration
- **date-fns** - Date formatting

## Contract Functions

| Function | Role | Description |
|----------|------|-------------|
| `create_invoice` | Seller | Create invoice, returns 2 InvoiceRecords (one for each party) |
| `verify_invoice` | Anyone | Verify invoice hash matches expected value |
| `mark_as_paid` | Buyer | Mark invoice as paid, returns PaymentRecord + updated InvoiceRecord |
| `create_seller_receipt` | Seller | Generate seller receipt, returns PaymentRecord |
| `cancel_invoice` | Seller | Cancel pending invoice |
| `verify_payment` | Anyone | Verify payment matches invoice |

## Project Structure

```
├── src/
│   └── main.leo              # Smart contract
├── app/
│   ├── page.tsx              # Landing page
│   ├── dashboard/            # Dashboard
│   ├── invoices/             # Invoice management
│   ├── receipts/             # Payment receipts
│   └── audit/                # Audit center
├── components/
│   ├── invoice-card.tsx      # Invoice display card
│   ├── function-guide.tsx    # Contract function reference
│   ├── wallet-connect-button.tsx
│   └── wallet-watcher.tsx
├── stores/
│   ├── invoiceStore.ts       # Invoice state management
│   └── walletStore.ts        # Wallet state management
├── services/
│   ├── invoiceService.ts     # Invoice service layer
│   └── paymentService.ts     # Payment service layer
├── docs/
│   ├── ARCHITECTURE.md       # Technical architecture
│   └── BUSINESS_FLOW.md      # Business logic flows
└── program.json              # Leo configuration
```

## Core Design

### Record Architecture
All state is stored in Records (UTXO-style), without global mappings. This design accommodates testnet limitations (no async/finalize support) while maintaining privacy.

### Key Records

**InvoiceRecord**
```leo
record InvoiceRecord {
    owner: address,
    invoice_id: field,
    seller: address,
    buyer: address,
    amount: u64,
    status: u8,          // 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED
    due_date: u32,
    invoice_hash: field,
    created_at: u32
}
```

**PaymentRecord**
```leo
record PaymentRecord {
    owner: address,
    payment_id: field,
    invoice_id: field,
    payer: address,
    payee: address,
    amount: u64,
    payment_nonce: field,
    paid_at: u32
}
```

### Dual Record Design
`create_invoice` returns two identical InvoiceRecords (except owner field):
- One for seller (owner: seller_address)
- One for buyer (owner: buyer_address)

Both parties can independently manage their records.

### Two-Step Payment Flow
1. Transfer credits via `credits.aleo/transfer_private`
2. Mark invoice as paid via `zk_invoice.aleo/mark_as_paid`

This workaround is necessary because testnet doesn't support atomic operations across programs.

## Deployment Information

- **Program ID**: `zk_invoice.aleo`
- **Network**: Aleo Testnet3
- **Status**: ✅ Deployed
- **Transaction**: `at19wjr8krkxg33ykjmhunrufzrmk53n2r6qew9ynznu9mzldvmg5xqyayedc`

For detailed deployment guide, see: [ALEO_DEPLOYMENT_GUIDE.md](./ALEO_DEPLOYMENT_GUIDE.md)

## Key Features

- 🔒 **Complete Privacy** - Transaction amounts and party details visible only to record holders
- ⚡ **Instant Confirmation** - Built on Aleo blockchain with second-level finality
- 💰 **Low Fees** - On-chain transaction costs far below traditional cross-border transfers
- ✅ **Verifiable** - Invoice hashes and payment receipts can be independently verified
- 🔍 **Audit Support** - Selective disclosure to auditors via View Keys
- 📱 **Easy to Use** - Connect Aleo wallet to get started

## Testing

### Contract Testing
```bash
# Compile contract
leo build

# Run Leo tests
./scripts/run_leo_tests.sh
```

### Frontend Testing
```bash
npm run test
```

## Known Limitations

1. **Testnet Constraints** - No async/finalize/mappings support, hence pure Record architecture
2. **Two-Step Payment** - Cannot atomically transfer and update state in one transition
3. **Frontend Simulation** - Currently uses localStorage; requires integration with on-chain querying
4. **Record Management** - Users must manually track Records; frontend needs Record scanning implementation

## Roadmap

- [ ] Integrate `@provablehq/sdk` for on-chain record scanning
- [ ] Implement Record tracking and management
- [ ] Add comprehensive loading/error handling
- [ ] Add integration tests
- [ ] Optimize UI responsiveness

## Documentation

- **[Architecture Documentation](./docs/ARCHITECTURE.md)** - Detailed technical architecture, data flows, security model
- **[Business Flow Documentation](./docs/BUSINESS_FLOW.md)** - Complete business logic flows with diagrams
- **[Deployment Guide](./ALEO_DEPLOYMENT_GUIDE.md)** - Aleo contract deployment guide
- **[Product Requirements](./PRD&TDD.md)** - Product requirements and technical design 

- [Aleo Developer Docs](https://developer.aleo.org/)
- [Leo Language Guide](https://developer.aleo.org/leo/)

## License

MIT
