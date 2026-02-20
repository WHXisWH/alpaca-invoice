# Audit Phase 3 Issue — Analysis Report

> Branch: `main` (after merge from `origin/develop`)
> Date: 2026-02-20

---

## 1. 问题现象 (Symptoms)

| # | 现象 | 触发路径 |
|---|------|----------|
| 1 | 点击 **Submit On-chain Authorization** 按钮后立刻报错，未弹出钱包确认 | Audit 页面生成包后点提交 |
| 2 | Phase 1 "一半失败"：`decrypt` / `expiresAt` 通过，`cipherHash` 或 `signature` 失败 | 运行 verify |
| 3 | Phase 3 始终失败：`No audit authorization on chain`（链上查不到记录） | 运行 verify |
| 4 | 同事已上链的发票，Phase 2 失败：`invoice not on chain or hash mismatch` | 用同事的 envelope 运行 verify |

---

## 2. 当前 main 与 develop 的差异

### develop 独有（已 merge 进 main）

| Commit | 文件 | 改动内容 |
|--------|------|----------|
| `265baa6` | `InvoiceRegistryServiceImpl.ts` | `getter_auth_cache` → `audit_authorization`（mapping 名字写错） |
| `dbc8b36` | `AuditServiceImpl.ts` | Phase 3 不再 early return，4/5 继续执行；`issuedAt` 改用 `invoice.createdAt`；添加 `toBigIntSafe`；`buildDecryptedData` 加入 `line_items_sum` / `tax_rate_bps`；`currentTime` 改用 `decrypted.issuedAt` |

### main 独有（AI 添加，develop 没有）

| Commit | 文件 | 改动内容 |
|--------|------|----------|
| `5081c25` | `useAuditPackageGenerate.ts` | 引入 `useTransactionController`；添加 `generatedInvoice` / `generatedFields` / `submittingAuth` state；`submitAuthorization` callback；`generate()` 内做快照 |
| `5081c25` | `audit-key-generator.tsx` | 添加 "Submit On-chain Authorization" 蓝色按钮 |

---

## 3. 各问题的可能原因

### 问题 1：Submit 按钮立刻失败（未弹钱包）

`submitAuthorization` 内部调用 `executeSetAuditAuthorization(generatedInvoice, ...)`。

该函数第一步做：
```typescript
if (invoice.seller !== publicKey) throw WalletServiceError(UNAUTHORIZED, ...)
```

**可能原因 A**：`generatedInvoice.seller` 与 `publicKey` 字段格式不严格相等（如大小写差异、`.private` / `.public` 后缀不一致），导致 seller check 立刻抛 UNAUTHORIZED，无法到达钱包。

**可能原因 B**：`useTransactionController()` 在 `useAuditPackageGenerate` 内部创建了自己的 `walletService` 实例（通过 `useMemo + useWallet`），与 audit hook 自身的 `walletService` 并行存在。如果 `useTransactionController` 内部的 `walletService` 为 null（初始化时序问题），`executeSetAuditAuthorization` 在 wallet check 处提前抛出。

---

### 问题 2：Phase 1 一半失败（signature check 或 cipherHash check）

**可能原因**：`useTransactionController()` 在同一组件树中与 audit hook 的 wallet 操作产生副作用冲突。

`AuditService.generate()` 内部会调用 `walletService.signMessage()` 来产生 `signature`，存入 payload。如果 `useTransactionController` 内部的状态（如 `isProcessing`）或 hook 副作用干扰了同一 wallet context 的 signing 流程，签名可能返回空字符串或失败。

Phase 1 verify 的 signature check：
```typescript
const sigOk = !!(decrypted.integrity?.signature);
```
签名为空时此处 = false → Phase 1 "一半失败"。

**次要原因**：`dbc8b36` 在 `buildDecryptedData` 中新增了 `line_items_sum` / `tax_rate_bps` 字段到 `data`，改变了 payload 结构。用旧代码生成的包 verify 时 `cipherHash` 不受影响（verify 从 decrypted 读数据），但如果 `canonicalJson` 对 key 顺序敏感，新旧包之间可能存在边界情况。

---

### 问题 3：Phase 3 始终失败（链上查不到）

**根本原因**：`audit_authorization` mapping 里没有该发票的记录。

`265baa6` 修复了查询 mapping 的名字（`getter_auth_cache` → `audit_authorization`），但 mapping 为空——因为 `set_audit_authorization` 交易从未被提交。

Submit 按钮（`5081c25`）本意是解决此问题，但由于问题 1（按钮立刻报错），交易从未真正提交上链，mapping 依然空。

---

### 问题 4：同事已上链的发票 Phase 2 失败

Phase 2 校验：
```
decrypted.invoiceHash === chainInvoiceHash（来自 getter_invoice_hash mapping）
```

**可能原因 A（dbc8b36 引入）**：`issuedAt` 改为使用 `invoice.createdAt`，如果 `invoice.createdAt` 不存在或类型不符，payload 中 `issuedAt` 值发生变化，`cipherHash` 在生成时与验证时结构不一致（影响新旧包兼容性）。

**可能原因 B**：同事生成包时使用的 invoice `id`（chain ID）与 registry 里存的 key 不一致，导致 `getter_invoice_hash[invoiceId]` 返回 null，Phase 2 判定为"not on chain"。

**可能原因 C**：`normalizeField` 只处理 `.private` / `.public` 后缀，如果 chain 返回的 hash 带有其他格式差异（如引号包裹），归一化不完整，导致字符串不等。

---

## 4. 当前状态总结

| 功能 | develop | main (当前) |
|------|---------|-------------|
| Phase 3 mapping 名字正确 | ✅ | ✅ |
| Phase 3 不阻断 Phase 4/5 | ✅ | ✅ |
| Submit 按钮入口 | ❌ 无 | ✅ 有（但立刻报错） |
| 提交 `set_audit_authorization` 成功 | ❌ 无入口 | ❌ 报错无法到达钱包 |
| Phase 1 稳定通过 | ✅ | ⚠️ 不稳定 |
| Phase 2 通过（同事发票） | ⚠️ 待确认 | ⚠️ 失败 |

---

## 5. 需要排查 / 修复的点

1. **Submit 按钮**：不应在 `useAuditPackageGenerate` 内部 call `useTransactionController()`，二者职责分离，混用会产生 hook 副作用冲突。应换一种方式调用 `executeSetAuditAuthorization`（例如通过 props 传入、或在组件层直接使用两个 hook）。

2. **seller check**：确认 `generatedInvoice.seller` 和 `publicKey` 的格式一致（`normalizeField` 或字符串 trim 后比较）。

3. **Phase 2 / invoiceHash 归一化**：检查 `normalizeField` 是否覆盖了链上返回的所有格式变体。

4. **新旧包兼容性**：`dbc8b36` 的 `buildDecryptedData` 新增字段后，确认旧包的 verify 路径不受影响（review `canonicalJson` 对 key 顺序的处理）。


console日志：
✅ Wallet disconnected, store cleared
layout-7434af1eb73dcada.js:800 ✅ AleoProtocolService initialized on client side
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: false
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
8183-ceb300db99b1e5d8.js:2651 [Store.getAllInvoices] Details not decrypted (no masterKey)
layout-7434af1eb73dcada.js:915 ✅ Wallet state synced to store: aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u
4909-9f8218222fab0ed5.js:1030 📋 [useInvoices] Initializing with publicKey: aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u
4909-9f8218222fab0ed5.js:1031 📋 [useInvoices] Has masterKey: false
4909-9f8218222fab0ed5.js:670 📋 [initialize] Starting initialization with masterKey: false
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: false
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
8183-ceb300db99b1e5d8.js:2651 [Store.getAllInvoices] Details not decrypted (no masterKey)
4909-9f8218222fab0ed5.js:689 📋 [initialize] Case 2: Loaded 7 invoices from IndexedDB
8183-ceb300db99b1e5d8.js:2914 [Store.rebuildSendingIndex] Rebuilt index with 0 SENDING invoice(s)
4909-9f8218222fab0ed5.js:1030 📋 [useInvoices] Initializing with publicKey: aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u
4909-9f8218222fab0ed5.js:1031 📋 [useInvoices] Has masterKey: true
4909-9f8218222fab0ed5.js:670 📋 [initialize] Starting initialization with masterKey: true
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: true
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
4909-9f8218222fab0ed5.js:689 📋 [initialize] Case 2: Loaded 7 invoices from IndexedDB
8183-ceb300db99b1e5d8.js:2914 [Store.rebuildSendingIndex] Rebuilt index with 0 SENDING invoice(s)
8183-ceb300db99b1e5d8.js:2845 [Store.setCurrentInvoice] Set current invoice: 5243491851017441877548160523099271365042341617799840520595368444564988739452field
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: false
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
8183-ceb300db99b1e5d8.js:2651 [Store.getAllInvoices] Details not decrypted (no masterKey)
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: false
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
8183-ceb300db99b1e5d8.js:2651 [Store.getAllInvoices] Details not decrypted (no masterKey)
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: true
addToWindow.js:1 Error:  NOT_GRANTED
7023-5f09cae3c703a652.js:215 WalletSignTransactionError: Permission Not Granted
    at LeoWalletAdapter.signMessage (layout-a18b046ca522a0d2.js:838:23)
    at async Object.signMessage (9108-a8783a967ae1a88b.js:226:20)
    at async push.97525.signMessage (8183-ceb300db99b1e5d8.js:1584:36)
    at async WalletService.signMessage (8183-ceb300db99b1e5d8.js:1261:31)
    at async AuditService.createEnvelope (4408-6baca41c9162e928.js:343:27)
    at async AuditService.generate (4408-6baca41c9162e928.js:428:28)
    at async page-c6cf83a809cf66fd.js:616:31
    at async page-c6cf83a809cf66fd.js:673:25
(anonymous) @ 7023-5f09cae3c703a652.js:215
7023-5f09cae3c703a652.js:215 ❌ Wallet error: WalletSignTransactionError: Permission Not Granted
    at LeoWalletAdapter.signMessage (layout-a18b046ca522a0d2.js:838:23)
    at async Object.signMessage (9108-a8783a967ae1a88b.js:226:20)
    at async push.97525.signMessage (8183-ceb300db99b1e5d8.js:1584:36)
    at async WalletService.signMessage (8183-ceb300db99b1e5d8.js:1261:31)
    at async AuditService.createEnvelope (4408-6baca41c9162e928.js:343:27)
    at async AuditService.generate (4408-6baca41c9162e928.js:428:28)
    at async page-c6cf83a809cf66fd.js:616:31
    at async page-c6cf83a809cf66fd.js:673:25
(anonymous) @ 7023-5f09cae3c703a652.js:215
page-c6cf83a809cf66fd.js:636 [Audit] generate() caught error Failed to generate audit package
7023-5f09cae3c703a652.js:215 ❌ Error caught: Object
(anonymous) @ 7023-5f09cae3c703a652.js:215
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: true
page-c6cf83a809cf66fd.js:622 [Audit] generate() success, setting result Object
page-c6cf83a809cf66fd.js:678 [Audit] generateFromForm received pkg true true
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: false
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
8183-ceb300db99b1e5d8.js:2651 [Store.getAllInvoices] Details not decrypted (no masterKey)
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: true
page-c6cf83a809cf66fd.js:622 [Audit] generate() success, setting result Object
page-c6cf83a809cf66fd.js:678 [Audit] generateFromForm received pkg true true
8183-ceb300db99b1e5d8.js:486 🔍 [scanInvoiceRecord] Scanning for invoice: 5243491851017441877548160523099271365042341617799840520595368444564988739452field
8183-ceb300db99b1e5d8.js:489 📋 [scanInvoiceRecord] Found 8 records
8183-ceb300db99b1e5d8.js:526 ✅ [scanInvoiceRecord] Found matching InvoiceRecord (spent: true): Object
8183-ceb300db99b1e5d8.js:556 ⚠️ [scanInvoiceRecord] No unspent record found, using latest (may be spent)
8183-ceb300db99b1e5d8.js:1366 [Wallet requestTransaction request] Object
addToWindow.js:1 Error:  INVALID_PARAMS: Error: Unspent record not found
7023-5f09cae3c703a652.js:215 WalletTransactionError: An unknown error occured. Please try again or report it
    at LeoWalletAdapter.requestTransaction (layout-a18b046ca522a0d2.js:627:23)
    at async Object.requestTransaction (9108-a8783a967ae1a88b.js:250:20)
    at async push.97525.requestTransaction (8183-ceb300db99b1e5d8.js:1603:20)
    at async WalletService.requestTransaction (8183-ceb300db99b1e5d8.js:1369:28)
    at async executeSetAuditAuthorization (6561-197fbe98a96fb40e.js:605:31)
    at async page-c6cf83a809cf66fd.js:655:13
(anonymous) @ 7023-5f09cae3c703a652.js:215
7023-5f09cae3c703a652.js:215 ❌ Wallet error: WalletTransactionError: An unknown error occured. Please try again or report it
    at LeoWalletAdapter.requestTransaction (layout-a18b046ca522a0d2.js:627:23)
    at async Object.requestTransaction (9108-a8783a967ae1a88b.js:250:20)
    at async push.97525.requestTransaction (8183-ceb300db99b1e5d8.js:1603:20)
    at async WalletService.requestTransaction (8183-ceb300db99b1e5d8.js:1369:28)
    at async executeSetAuditAuthorization (6561-197fbe98a96fb40e.js:605:31)
    at async page-c6cf83a809cf66fd.js:655:13
(anonymous) @ 7023-5f09cae3c703a652.js:215
7023-5f09cae3c703a652.js:215 [Wallet requestTransaction raw error] WalletTransactionError: An unknown error occured. Please try again or report it
    at LeoWalletAdapter.requestTransaction (layout-a18b046ca522a0d2.js:627:23)
    at async Object.requestTransaction (9108-a8783a967ae1a88b.js:250:20)
    at async push.97525.requestTransaction (8183-ceb300db99b1e5d8.js:1603:20)
    at async WalletService.requestTransaction (8183-ceb300db99b1e5d8.js:1369:28)
    at async executeSetAuditAuthorization (6561-197fbe98a96fb40e.js:605:31)
    at async page-c6cf83a809cf66fd.js:655:13
(anonymous) @ 7023-5f09cae3c703a652.js:215
7023-5f09cae3c703a652.js:215 ❌ Error caught: Object
(anonymous) @ 7023-5f09cae3c703a652.js:215
4408-6baca41c9162e928.js:725 [VerifyPhases] Phase 1: pre-check (expiry, decrypt, cipherHash, signature)
4408-6baca41c9162e928.js:728 [VerifyPhases] Phase 1: expiresAt Object
4408-6baca41c9162e928.js:748 [VerifyPhases] Phase 1: decrypt OK
4408-6baca41c9162e928.js:777 [VerifyPhases] Phase 1: cipherHash Object
4408-6baca41c9162e928.js:786 [VerifyPhases] Phase 1: signature Object
4408-6baca41c9162e928.js:796 [VerifyPhases] Phase 1 result: true Object
4408-6baca41c9162e928.js:814 [VerifyPhases] Phase 2: fetching invoice_hash for invoiceId: 4099178512974708679569224827499362939267739788555807399503502454394724609270field
4408-6baca41c9162e928.js:817 [VerifyPhases] Phase 2: invoice on chain Object
4408-6baca41c9162e928.js:836 [VerifyPhases] Phase 2 result: true
4408-6baca41c9162e928.js:857 [VerifyPhases] Phase 3: fetching get_audit_authorization for invoiceId: 4099178512974708679569224827499362939267739788555807399503502454394724609270field
7023-5f09cae3c703a652.js:215 [VerifyPhases] Verification error: Expected property name or '}' in JSON at position 4 (line 2 column 3)
(anonymous) @ 7023-5f09cae3c703a652.js:215
4909-9f8218222fab0ed5.js:1030 📋 [useInvoices] Initializing with publicKey: aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u
4909-9f8218222fab0ed5.js:1031 📋 [useInvoices] Has masterKey: true
4909-9f8218222fab0ed5.js:670 📋 [initialize] Starting initialization with masterKey: true
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: true
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
4909-9f8218222fab0ed5.js:689 📋 [initialize] Case 2: Loaded 7 invoices from IndexedDB
8183-ceb300db99b1e5d8.js:2914 [Store.rebuildSendingIndex] Rebuilt index with 0 SENDING invoice(s)
4909-9f8218222fab0ed5.js:1030 📋 [useInvoices] Initializing with publicKey: aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u
4909-9f8218222fab0ed5.js:1031 📋 [useInvoices] Has masterKey: true
4909-9f8218222fab0ed5.js:670 📋 [initialize] Starting initialization with masterKey: true
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: true
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
4909-9f8218222fab0ed5.js:689 📋 [initialize] Case 2: Loaded 7 invoices from IndexedDB
8183-ceb300db99b1e5d8.js:2914 [Store.rebuildSendingIndex] Rebuilt index with 0 SENDING invoice(s)
8183-ceb300db99b1e5d8.js:2573 [Store.getAllInvoices] Found 7 invoices in IndexedDB
8183-ceb300db99b1e5d8.js:2574 [Store.getAllInvoices] Has masterKey for decryption: false
8183-ceb300db99b1e5d8.js:2645 [Store.getAllInvoices] Updated memory state with 7 invoices
8183-ceb300db99b1e5d8.js:2651 [Store.getAllInvoices] Details not decrypted (no masterKey)