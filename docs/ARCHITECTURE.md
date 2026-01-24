# Alpaca Invoice - Technical Architecture

## 1. Architecture Overview

Alpaca Invoice is a privacy-preserving B2B invoice system built on the Aleo blockchain. The frontend adopts a **4-layer decoupled architecture** to separate privacy data management from UI rendering, achieving deep decoupling between business logic and the Aleo protocol.

### 1.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              View Layer                                  │
│   React components for UI rendering and user interaction                 │
│   (Dashboard, Invoice List, Invoice Detail, Receipts, Audit Center)     │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ User interaction / State display
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Controller Layer                               │
│   Custom Hooks orchestrating business logic                              │
│   (useWalletController, useInvoiceDetail, useTransactionController)     │
└──────────────────┬──────────────────────────────────┬───────────────────┘
                   │ Coordinate operations             │ Read/Update state
                   ▼                                   ▼
┌─────────────────────────────────┐   ┌───────────────────────────────────┐
│         Service Layer           │   │           Model Layer              │
│  Protocol adapters & utilities  │   │    Zustand Stores + IndexedDB     │
│  (Wallet, Crypto, Storage, RPC) │   │    (User, Invoice, Transaction)   │
└─────────────────────────────────┘   └───────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Aleo Blockchain                                  │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    zk_invoice.aleo Program                       │   │
│   │  Transitions: create_invoice, mark_as_paid, cancel_invoice,     │   │
│   │               verify_invoice, verify_payment, create_seller_receipt │
│   │  Records: InvoiceRecord, PaymentRecord                           │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    credits.aleo Program                          │   │
│   │  transfer_private (for payment transfers)                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Layer Responsibilities

| Layer | Responsibility | Key Characteristics |
|-------|---------------|---------------------|
| **View** | UI rendering, user interaction | Pure React components, no business logic |
| **Controller** | Business logic orchestration | Custom Hooks, state derivation, flow control |
| **Service** | Protocol adaptation, heavy operations | Wallet interaction, encryption, RPC communication |
| **Model** | Global state management | Zustand stores, IndexedDB persistence |

---

## 2. Layer Details

### 2.1 View Layer

**Responsibility**: UI rendering, user interaction, and display of derived business states.

**Core Characteristics**:
- Pure React components without business logic
- Interacts only with Controller layer
- Does not directly read Store or call Aleo SDK

**Page Structure**:
```
app/
├── page.tsx                    # Landing page
├── layout.tsx                  # Root layout with sidebar
├── dashboard/page.tsx          # Dashboard with statistics
├── invoices/
│   ├── page.tsx               # Invoice list with filtering
│   ├── create/page.tsx        # Create invoice form
│   └── [id]/page.tsx          # Invoice detail view
├── receipts/page.tsx          # Payment receipts
└── audit/page.tsx             # Audit key generator
```

### 2.2 Controller Layer

**Responsibility**: System's "command center". Receives View instructions, coordinates Service operations, and updates Model based on results.

**Core Functions**:
1. **State Derivation**: Derive business semantics from raw Records (e.g., `isPaid`, `canCancel`)
2. **Flow Control**: Manage async transaction lifecycle (Pending → Mining → Confirmed)
3. **Error Handling**: Capture Service errors and transform to user-friendly messages

**Module Responsibilities**:

| Hook | Responsibility |
|------|---------------|
| `useWalletController` | Wallet connection, balance polling, identity authorization |
| `useAuthCheck` | Independent authorization check, reusable across pages |
| `useInvoices` | Invoice list compositor (initialize, poll, filter, role) |
| `useInvoiceDetail` | Invoice detail compositor (data, role, chain sync, actions) |
| `useTransactionController` | Transaction flow management (create/pay/cancel) |
| `useAuditController` | Privacy data packaging, signing, and export |

### 2.3 Service Layer

**Responsibility**: All "heavy" and "low-level" operations. Adapter for Aleo protocol.

**Core Functions**:
1. **Wallet Interaction**: Wrap `requestRecords`, `requestTransaction` (ZKP generated by wallet)
2. **Encryption**: AES encryption for invoice details, audit key derivation, SHA-256 hashing
3. **Unit Conversion**: Microcredits ↔ Credits precision handling
4. **RPC Communication**: Network communication with Aleo nodes

**Service Interfaces**:

| Service | Responsibility | Status |
|---------|---------------|--------|
| `IWalletService` | Connect wallet, get ViewKey, balance, sign, request transaction | Implemented |
| `ICryptoService` | Compute invoice hash, local encrypt/decrypt, Record parsing | Implemented |
| `IStorageService` | IndexedDB CRUD for data persistence | Implemented |
| `IPollingService` | Generic polling service for status tracking | Implemented |
| `IAleoProtocolService` | Node RPC interaction (broadcast, query Mapping) | Partial |

### 2.4 Model Layer

**Responsibility**: System's data source, managing global state as "single source of truth".

**Core Components**:
1. **Zustand Stores**: Store synced Records and Mapping states
2. **IndexedDB**: Local persistence for decrypted invoice details

**Store Structure**:

| Store | Responsibility |
|-------|---------------|
| `useUserStore` | User identity, masterKey, public key |
| `useInvoiceStore` | Invoice index, CRUD operations |
| `useArchiveStore` | Decrypted details archive |
| `useTransactionStore` | Transaction progress and logs |
| `useErrorStore` | Error state management |

---

## 3. Data Flow

### 3.1 Invoice Creation Flow

```
User Input → Frontend Form → Controller
                                │
                                ▼
                    Compute Invoice Hash (SHA-256)
                                │
                                ▼
                    Request Transaction via Wallet
                    (Wallet generates ZK proof internally)
                                │
                                ▼
                    Broadcast to Aleo Network
                                │
                                ▼
                    Return 2 InvoiceRecords
                    (seller + buyer)
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            Seller Record           Buyer Record
            (owner: seller)         (owner: buyer)
                    │                       │
                    └───────────┬───────────┘
                                ▼
                    Encrypt & Store in IndexedDB
                    (status: SENDING)
                                │
                                ▼
                    Poll until CONFIRMED
                                │
                                ▼
                    Update UI
```

### 3.2 Payment Flow (Two-Step)

```
Buyer Initiates Payment
        │
        ▼
Step 1: Scan InvoiceRecord from chain
        │
        ▼
Step 2: Transfer Credits
        │
        ▼
credits.aleo/transfer_private
        │
        ├─ Input: buyer's credit record
        ├─ Input: seller address
        ├─ Input: amount
        │
        ▼
Step 3: Mark as Paid
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
        ▼
Return Updated InvoiceRecord + PaymentRecord
        │
        ▼
Update IndexedDB & UI
```

### 3.3 Invoice Status Lifecycle

```
    ┌──────────────┐
    │   PENDING    │ ◄─── Initial state after creation
    └──────┬───────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐  ┌───────────┐
│  PAID   │  │ CANCELLED │ (seller only)
└─────────┘  └───────────┘
     │           │
     └─────┬─────┘
           │
           ▼
    ┌───────────┐
    │  EXPIRED  │ (time-based check)
    └───────────┘
```

---

## 4. Smart Contract Design

### 4.1 Record Definitions

**InvoiceRecord**:
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

**PaymentRecord**:
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

### 4.2 Dual Record Design

`create_invoice` returns two identical InvoiceRecords (except owner field):
- One for seller (owner: seller_address)
- One for buyer (owner: buyer_address)

Both parties can independently manage their records.

### 4.3 Pure Record Architecture

**Design Choice**: All state stored in Records (UTXO-style), no global mappings.

**Reasons**:
- Testnet limitation: doesn't support async/finalize
- Privacy: records are private by default
- Simplicity: no state synchronization needed

---

## 5. Error Handling System

### 5.1 Error Flow

```
Service Layer (Technical Errors)
        │
        │ WalletServiceError / ProtocolServiceError
        ▼
Controller Layer (Capture & Transform)
        │
        │ toAppError()
        ▼
ErrorStore (State Management)
        │
        ▼
ErrorHandler (Toast Display)
        │
        ▼
User Interface
```

### 5.2 Error Types

**Service Layer** (Technical):
- `WalletServiceError`: NOT_INSTALLED, USER_REJECTED, INSUFFICIENT_FEE, etc.
- `ProtocolServiceError`: NODE_CONNECTION_FAILED, INVALID_RECORD, etc.

**UI Layer** (User-Friendly):
- WALLET_NOT_CONNECTED
- TRANSACTION_REJECTED
- INSUFFICIENT_BALANCE
- NETWORK_ERROR

---

## 6. Storage Strategy

### 6.1 Data Persistence

| Data Type | Persisted | Location | Reason |
|-----------|-----------|----------|--------|
| Basic Info (id, seller, buyer, amount) | Yes | IndexedDB | Source for unconfirmed invoices |
| Encrypted Details | Yes | IndexedDB | Sensitive data, needs encryption |
| Confirmation Status | No | Memory | Runtime state, fetched from chain |
| Chain Data | No | On-chain | Confirmed invoices more reliable from chain |

### 6.2 Encryption Scheme

- **Key Derivation**: PBKDF2 (100,000 iterations) from wallet signature
- **Encryption**: AES-GCM symmetric encryption
- **Integrity**: Hash verification via `verifyInvoiceIntegrity`

---

## 7. Technology Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **IndexedDB (idb)** - Client-side persistence

### Blockchain
- **Leo 3.4.0** - Aleo smart contract language
- **@provablehq/sdk** - Aleo SDK
- **@demox-labs/aleo-wallet-adapter** - Wallet integration

### Wallets Supported
- Leo Wallet
- Puzzle Wallet

---

## 8. Deployment

### Contract
- **Program ID**: `zk_invoice.aleo`
- **Network**: Aleo Testnet
- **Deployment TX**: `at19wjr8krkxg33ykjmhunrufzrmk53n2r6qew9ynznu9mzldvmg5xqyayedc`

### Frontend
- **Platform**: Vercel
- **Environment Variables**:
  - `NEXT_PUBLIC_ALEO_NETWORK=testnet`
  - `NEXT_PUBLIC_ALEO_ADDRESS=your_address`

---

## 9. Version Information

- **Document Version**: 2.0
- **Code Version**: 1.2
- **Last Updated**: January 2026
