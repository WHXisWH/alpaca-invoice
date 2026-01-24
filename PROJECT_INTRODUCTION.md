# Alpaca Invoice (ZK-Invoice)

## What it does

Alpaca Invoice is a privacy-preserving B2B invoice and payment system built on the Aleo blockchain. It enables businesses to create, send, and pay invoices with complete transaction privacy while maintaining the ability to provide selective disclosure for compliance and auditing purposes.

The system allows:
- **Sellers** to create encrypted invoices and send them to buyers on-chain
- **Buyers** to verify, pay, and receive cryptographic receipts for completed payments
- **Auditors** to access specific invoices through time-limited audit keys without compromising overall financial privacy
- Both parties to maintain verifiable payment records using zero-knowledge proofs

## The problem it solves

1. **Commercial Intelligence Leakage**: Traditional blockchain payments expose transaction amounts, suppliers, and purchase volumes publicly. Alpaca Invoice encrypts all transaction details on-chain, storing only cryptographic proofs.

2. **Cross-border Payment Friction**: International B2B payments involve slow settlement times (3-5 days) and high fees (3-5%). Our solution provides near-instant settlement with minimal transaction costs (<$0.10).

3. **Reconciliation Complexity**: Manual invoice-to-payment matching is error-prone and time-consuming. The system automatically generates ZK receipts upon payment, enabling "pay-to-reconcile" automation.

4. **Privacy vs. Compliance Dilemma**: Businesses need transaction privacy for competitive advantage but must satisfy regulatory audits. Alpaca Invoice uses View Keys and Audit Keys to enable selective disclosure without revealing entire financial history.

## Challenges I ran into

1. **Testnet Limitations**: Aleo Testnet doesn't support the `finalize` function for mapping updates during transaction execution. We implemented a pure Record-based model using dual records (one for seller, one for buyer) to maintain state without global mappings.

2. **Two-Step Payment Flow**: Unlike traditional smart contracts, we couldn't atomically combine credit transfer and invoice status update. We designed a two-step payment process: first `credits.aleo/transfer_private`, then `zk_invoice.aleo/mark_as_paid`, with robust error handling for partial failures.

3. **Record Scanning and Sync**: Aleo's UTXO-like record model requires scanning the blockchain for user records. We built a polling service with IndexedDB caching to maintain responsive UI while waiting for transaction confirmations.

4. **Client-side ZK Proof Generation**: Generating zero-knowledge proofs in the browser is computationally intensive. We implemented progress tracking and user feedback systems to manage the 10-30 second proof generation times.

5. **Wallet Integration Complexity**: Different Aleo wallets have varying API implementations. We abstracted wallet interactions through a service layer to ensure compatibility with Leo Wallet and Puzzle Wallet.

## Technologies I used

**Blockchain & Cryptography**
- **Aleo Network** - Zero-knowledge native Layer 1 blockchain
- **Leo Language** - Aleo's smart contract programming language
- **@provablehq/sdk** - Aleo SDK for transaction execution and proof generation
- **BHP256** - Hash function for invoice ID generation and verification

**Frontend**
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **IndexedDB (idb)** - Client-side encrypted data persistence

**Wallet Integration**
- **@demox-labs/aleo-wallet-adapter** - Wallet connection framework
- **Leo Wallet** - Primary Aleo wallet
- **Puzzle Wallet** - Secondary wallet support

**UI Components**
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icon library
- **Sonner** - Toast notifications

## How we built it

**Architecture**: We adopted a layered architecture to separate concerns:
- **View Layer**: Next.js pages and React components for UI
- **Controller Layer**: Custom hooks orchestrating business logic
- **Service Layer**: Aleo protocol adapters, crypto services, and storage services
- **Model Layer**: Zustand stores for state management

**Smart Contract Design**: The Leo contract uses a dual-record model where each invoice creates two identical `InvoiceRecord` instances - one owned by the seller and one by the buyer. This ensures both parties have independent, private copies of the same invoice data.

**Payment Flow**: We implemented a manual two-step payment:
1. Transfer credits privately using `credits.aleo/transfer_private`
2. Update invoice status using `zk_invoice.aleo/mark_as_paid`

**Data Persistence**: Invoice metadata is stored in IndexedDB with client-side encryption. Transaction status is polled from the blockchain until confirmed, then cached locally.

**Error Handling**: Comprehensive error boundaries and retry mechanisms handle network failures, wallet disconnections, and partial transaction failures.

## What we learned

1. **Privacy-preserving systems require different mental models**: Unlike traditional apps where all data is accessible, Aleo's record model means you only see data you own. This fundamentally changes how we design data flows and user experiences.

2. **ZK proofs have UX implications**: The computational cost of generating proofs (10-30 seconds) requires thoughtful UI design with progress indicators and user education.

3. **Blockchain state synchronization is non-trivial**: Building reliable sync between local state and on-chain records requires careful consideration of race conditions, network latency, and transaction finality.

4. **Testnet limitations inform mainnet architecture**: Working around testnet constraints helped us design more robust systems that will transition smoothly to mainnet.

5. **Wallet ecosystem maturity matters**: The Aleo wallet ecosystem is still evolving, requiring abstraction layers to handle API differences and provide consistent user experience.

## What's next for Alpaca Invoice

**Immediate (Q1 2026)**
- USDCx stablecoin integration when available on mainnet
- Enhanced audit reporting with PDF export
- Mobile-responsive design improvements

**Medium-term (Q2-Q3 2026)**
- Multi-signature approval workflows for enterprise
- Batch invoice processing
- ERP system integration APIs
- IPFS integration for large invoice attachments

**Long-term (Q4 2026 and beyond)**
- Aleo Mainnet deployment
- Supply chain financing features
- Cross-chain invoice settlement
- Regulatory compliance templates for different jurisdictions
