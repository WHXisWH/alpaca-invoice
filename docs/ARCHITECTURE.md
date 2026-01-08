# ZK-Invoice Technical Architecture

## System Overview

ZK-Invoice is a privacy-preserving invoice and payment system built on the Aleo blockchain. It uses zero-knowledge proofs to protect transaction privacy while maintaining verifiability and audit capabilities.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                          │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Next.js 14   │  │  Tailwind    │  │  Wallet Adapter    │  │
│  │  (App Router) │  │  CSS         │  │  (@demox-labs)     │  │
│  └───────────────┘  └──────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      State Management                           │
│  ┌───────────────────────┐     ┌───────────────────────────┐   │
│  │   Zustand Stores      │     │   Local Storage Cache     │   │
│  │  - walletStore.ts     │     │   - Invoice Records       │   │
│  │  - invoiceStore.ts    │     │   - Payment Receipts      │   │
│  └───────────────────────┘     └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Service Layer                               │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ invoiceService  │  │ paymentService│  │  auditService   │   │
│  │  - Create       │  │  - Transfer   │  │  - Generate Keys│   │
│  │  - Verify       │  │  - Mark Paid  │  │  - Verify       │   │
│  │  - Cancel       │  │  - Receipt    │  │                 │   │
│  └─────────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Aleo Blockchain Layer                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              zk_invoice.aleo Program                      │ │
│  │  ┌──────────────────────────────────────────────────┐    │ │
│  │  │  Transitions:                                    │    │ │
│  │  │  - create_invoice                                │    │ │
│  │  │  - verify_invoice                                │    │ │
│  │  │  - mark_as_paid                                  │    │ │
│  │  │  - create_seller_receipt                         │    │ │
│  │  │  - cancel_invoice                                │    │ │
│  │  │  - verify_payment                                │    │ │
│  │  └──────────────────────────────────────────────────┘    │ │
│  │                                                           │ │
│  │  ┌──────────────────────────────────────────────────┐    │ │
│  │  │  Records:                                        │    │ │
│  │  │  - InvoiceRecord                                 │    │ │
│  │  │  - PaymentRecord                                 │    │ │
│  │  └──────────────────────────────────────────────────┘    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              credits.aleo Program                         │ │
│  │  - transfer_private (for payment transfers)               │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Frontend Layer

**Technology Stack:**
- **Next.js 14**: React framework with App Router for server-side rendering and routing
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling with amber/yellow theme
- **date-fns**: Date formatting and manipulation

**Key Components:**

```
app/
├── page.tsx                    # Landing page
├── layout.tsx                  # Root layout with header/footer
├── dashboard/
│   └── page.tsx               # Main dashboard
├── invoices/
│   ├── page.tsx               # Invoice list
│   ├── create/
│   │   └── page.tsx          # Create invoice form
│   └── [id]/
│       └── page.tsx          # Invoice detail view
├── receipts/
│   └── page.tsx              # Payment receipts
└── audit/
    └── page.tsx              # Audit key generator

components/
├── invoice-card.tsx           # Invoice display card
├── invoice-form.tsx           # Invoice creation form
├── function-guide.tsx         # Contract function reference
├── receipt-viewer.tsx         # Payment receipt display
├── audit-key-generator.tsx    # Audit key generator
├── wallet-connect-button.tsx  # Wallet connection UI
├── wallet-watcher.tsx         # Wallet state monitoring
└── providers.tsx              # Context providers
```

### 2. State Management

**Zustand Stores:**

**walletStore.ts**
- Connected state
- Wallet address
- Connection/disconnection handlers
- Wallet adapter integration

**invoiceStore.ts**
- Sent invoices list
- Received invoices list
- Payment receipts
- CRUD operations (create, fetch, pay, cancel)
- Filter state (all, pending, paid, cancelled)

**Storage Strategy:**
- Uses localStorage for persistence
- Records are stored as JSON
- Automatic sync on wallet connection
- Cache invalidation on updates

### 3. Service Layer

**invoiceService.ts**
- Invoice creation logic
- Hash generation (BHP256)
- Invoice encryption
- Record construction
- Transaction submission

**paymentService.ts**
- Payment transfer coordination
- Two-step payment flow:
  1. credits.aleo/transfer_private
  2. zk_invoice.aleo/mark_as_paid
- Receipt generation
- Payment verification

**auditService.ts**
- Audit key generation
- View key derivation
- Selective disclosure
- Time-bound access control

### 4. Smart Contract Layer

**Contract Architecture:**

```leo
program zk_invoice.aleo {
    // Status constants
    const STATUS_PENDING: u8 = 0u8;
    const STATUS_PAID: u8 = 1u8;
    const STATUS_CANCELLED: u8 = 2u8;
    const STATUS_EXPIRED: u8 = 3u8;

    // Record definitions
    record InvoiceRecord {
        owner: address,
        invoice_id: field,
        seller: address,
        buyer: address,
        amount: u64,
        status: u8,
        due_date: u32,
        invoice_hash: field,
        created_at: u32
    }

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

    // Transition functions
    // ... (6 transitions)
}
```

## Data Flow Architecture

### Invoice Creation Flow

```
User Input → Frontend Form → invoiceService
                                    │
                                    ▼
                          Generate Invoice Hash
                                    │
                                    ▼
                          Build Transaction Input
                                    │
                                    ▼
                    Call zk_invoice.aleo/create_invoice
                                    │
                                    ▼
                          Aleo Network Processing
                                    │
                                    ▼
                      Return 2 InvoiceRecords
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            Seller Record                   Buyer Record
         (owner: seller)                (owner: buyer)
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                        Store in localStorage
                                    │
                                    ▼
                          Update Zustand Store
                                    │
                                    ▼
                            UI Update (React)
```

### Payment Flow

```
Buyer Initiates Payment
        │
        ▼
Step 1: Transfer Credits
        │
        ▼
credits.aleo/transfer_private
        │
        ├─ Input: sender's credit record
        ├─ Input: recipient address
        ├─ Input: amount
        │
        ▼
Get Transaction ID & Nonce
        │
        ▼
Step 2: Mark as Paid
        │
        ▼
zk_invoice.aleo/mark_as_paid
        │
        ├─ Input: InvoiceRecord
        ├─ Input: payment_nonce
        │
        ▼
Generate PaymentRecord
        │
        ├─ payment_id (hash)
        ├─ invoice_id
        ├─ payer address
        ├─ payee address
        ├─ amount
        ├─ payment_nonce
        │
        ▼
Return Updated InvoiceRecord + PaymentRecord
        │
        ▼
Store Receipt in localStorage
        │
        ▼
Update UI
```

## Record Management

### Record Storage Model

**Pure Record-Based Architecture:**
- NO global mappings
- NO async/finalize operations
- All state in Records (UTXO-style)

**Why?**
- Testnet limitation: doesn't support async/finalize
- Privacy: records are private by default
- Simplicity: no state synchronization needed

**Record Lifecycle:**

```
Creation → Active → Updated → Consumed
                        │
                        └──→ New Record Generated
```

**Dual Record Design:**
- Each invoice creates TWO identical records
- One for seller (owner: seller_address)
- One for buyer (owner: buyer_address)
- Both have same content except owner field
- Enables both parties to manage independently

### Record Tracking

**Frontend Challenge:**
Records are private and not queryable on-chain.

**Current Solution:**
- Store records in localStorage after creation
- Track record IDs and states
- Manual sync required after wallet switch

**Future Enhancement:**
- Integrate with Aleo SDK for record scanning
- Use view keys for automatic discovery
- Implement encrypted cloud sync

## Privacy Model

### Zero-Knowledge Proofs

**What's Private:**
- Invoice amounts
- Party identities (buyer/seller)
- Payment nonces
- Transaction details

**What's Public:**
- Program ID (zk_invoice.aleo)
- Transaction IDs
- Block timestamps
- Program execution success/failure

**How Privacy is Maintained:**
- All records are private (encrypted on-chain)
- Only record owners can decrypt
- ZK proofs verify correctness without revealing data
- Hash commitments prove invoice authenticity

### Audit Support

**Selective Disclosure:**
- View keys enable read-only access
- Time-bound audit keys
- Scope-limited disclosure (specific invoices only)
- No modification rights for auditors

**Audit Flow:**
```
1. Generate Audit Key (view key + scope + expiry)
2. Share key with auditor
3. Auditor uses key to decrypt specific records
4. Auditor can verify but not modify
5. Key expires after set duration
```

## Security Considerations

### Smart Contract Security

**Input Validation:**
- Amount > 0
- Valid addresses
- Status checks before transitions
- Timestamp validation

**State Consistency:**
- Status transitions enforce valid flow
- No double-payment possible
- Cancelled invoices can't be paid
- Paid invoices can't be cancelled

**Hash Security:**
- BHP256 hash algorithm
- Collision resistance
- Deterministic hashing
- Invoice content integrity

### Frontend Security

**Current Limitations:**
- No backend server (client-side only)
- localStorage can be cleared
- No encryption at rest
- Wallet private keys managed by wallet extension

**Best Practices:**
- Never store private keys in localStorage
- Use wallet adapters for signing
- Validate all inputs
- Sanitize addresses
- Check transaction results

## Deployment Architecture

### Development
```
Local Machine
├── npm run dev (Next.js)
├── leo build (compile contract)
└── leo deploy (testnet)
```

### Production (Vercel)
```
GitHub Repository
        │
        ▼
Vercel CI/CD
        │
        ├─ Build Next.js app
        ├─ Set environment variables
        └─ Deploy to CDN
        │
        ▼
Vercel Edge Network
        │
        └─ Serve static files
        └─ Server-side rendering
        │
        ▼
User Browser
        │
        ├─ Load React app
        ├─ Connect Aleo wallet
        └─ Interact with blockchain
```

### Environment Variables

**Required for Vercel:**
```bash
NEXT_PUBLIC_ALEO_NETWORK=testnet
NEXT_PUBLIC_ALEO_ADDRESS=aleo1...
```

**Optional (local dev only):**
```bash
ALEO_PRIVATE_KEY=APrivateKey1...
ALEO_VIEW_KEY=AViewKey1...
```

## Performance Considerations

### Transaction Times
- Block time: ~10-15 seconds (Aleo testnet)
- Transaction confirmation: 1-2 blocks
- ZK proof generation: 2-5 seconds
- Total invoice creation: ~20-30 seconds

### Scalability
- No on-chain storage (only records)
- Linear scaling with user base
- No global state contention
- Parallel transaction processing

### Optimization Strategies
- Lazy loading components
- Code splitting by route
- Static asset optimization
- Memoized computations
- Efficient record filtering

## Technology Choices

### Why Aleo?
- Native zero-knowledge proofs
- Privacy by default
- Leo language simplicity
- Active ecosystem

### Why Record-Based?
- Testnet limitations
- UTXO familiarity
- Privacy benefits
- Simpler state model

### Why Next.js?
- SEO friendly
- Fast page loads
- File-based routing
- Built-in optimization

### Why Zustand?
- Lightweight (3kb)
- No boilerplate
- TypeScript support
- React 18 compatible

## Future Improvements

### Short Term
- Integrate @provablehq/sdk for record scanning
- Add loading states and error handling
- Implement retry logic
- Add transaction history

### Medium Term
- Multi-signature support
- Recurring invoices
- Batch operations
- Invoice templates

### Long Term
- Cross-chain payments
- Fiat on/off ramps
- Mobile app (React Native)
- Enterprise features

## References

- [Aleo Developer Docs](https://developer.aleo.org/)
- [Leo Language Guide](https://developer.aleo.org/leo/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
