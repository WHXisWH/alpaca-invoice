# Alpaca Invoice — Wave 2 详细升级设计与工程规格书

> 本文档基于 Wave 1 已部署合约 `zk_invoice.aleo`、评审反馈、以及 Leo 官方文档，提出 Wave 2 的完整升级方案。
> 原则：**只描述"做什么"和"怎么做"，不预估时间。**

**Language note**: All UI copy, UX strings, and code comments must be written in English only.

## WBS — Wave 2 极细粒度工作分解（顺序执行）

### Phase 1: 合约重构（公共锚点 + async + 细粒度校验）
1. **同步基础升级**
   - Bump `program.json` to `zk_invoice_v2.aleo`, version `0.2.0`, ensure dependency on `credits.aleo` remains network-based.
   - Regenerate `build` artifacts locally via `leo build` to catch schema regressions.
2. **数据结构调整**
   - Extend `InvoiceRecord` with `order_id: field`, `tax_amount: u64`, keep existing fields unchanged.
   - (Optional) Add `AuditReport` record scaffold; guard with feature flag in tests.
3. **Mapping 定义落地**
   - Add `invoice_registry`, `invoice_status`, `invoice_count` mappings with exact types per §1.2。
   - Document mapping visibility rationale inside `README` of contract folder (English).
4. **Transition → async 改造**
   - `create_invoice`: add `current_time`, emit `Future` → `finalize_create_invoice` writes registry/status/count.
   - `mark_as_paid`: return `Future` → `finalize_mark_as_paid` updates status only.
   - `cancel_invoice`: return `Future` → `finalize_cancel_invoice` updates status only.
   - Ensure finalize functions do **not** leak amount/buyer; only ids/hash/status/seller count as designed.
5. **辅助计算一致性**
   - Add `compute_invoice_id` transition (pure) iff SDK hash_to_field unavailable; guard via feature flag.
6. **ZK 合规证明实现**
   - Implement `prove_tax_compliance`, `prove_amount_in_range`, `prove_invoice_ownership` exactly as §4，respecting private/public inputs.
   - For ownership proof finalize: assert mapping hash equals claimed hash.
7. **审计报告可选链上记录**
   - Implement `submit_audit_report` + finalize stub (stats only, no result exposure) if feature enabled.
8. **Boundary & constraint checks**
   - Validate transaction size <128KB with representative inputs (invoice with max field sizes).
   - Confirm mapping count << 31; document in comments.
9. **测试用例落地**
   - Add tests listed于 §8.1 one by one; ensure async/finalize atomicity test covers revert path.
   - Include timestamp test: `created_at` equals passed `current_time`.
10. **本地验证**
    - `leo run` for all transitions; capture outputs for doc appendix。

### Phase 2: 前端协议层 & 交易构建
11. **Protocol service 扩展**
    - `IAleoProtocolService`: add `getInvoiceHash/Status/Count/verifyInvoiceOnChain`.
    - `AleoProtocolServiceImpl`: implement mapping reads using `getProgramMappingValue` with new program ID.
12. **Invoice ID 一致性**
    - Attempt SDK `hashToField` parity check vs contract; fallback to calling `compute_invoice_id` transition (local call preferred).
    - Add unit tests asserting front/back parity for identical inputs.
13. **Transaction payload 更新**
    - Update `create_invoice` inputs to include `current_time` (unix seconds).
    - Switch `programId` to `zk_invoice_v2.aleo`; keep legacy ID for read-only legacy queries.
14. **Polling 优化**
    - Update `useInvoicePollingCore` to parallel record scan + mapping status.
    - Add cache `chainStatusCache` per §6.2 with TTL; unit tests for cache hit/miss.

### Phase 3: 审计链上锚点集成 & Package v2
15. **AuditPackage V2 类型**
    - Extend `AuditPackageV2` fields（programId, chainVerifiable flag等）于 `lib/types.ts`; keep V1 backward compatible discriminated union.
16. **验证逻辑**
    - Enhance `validateAuditPackage` to perform chain hash/status checks; return structured `chainVerification`.
    - Add tests covering: not found, hash mismatch, status mismatch, V1 bypass.
17. **审计 UI**
    - `app/(app)/audit/page.tsx`: show new chain verification block (exists/hash/status/recompute).
    - Add “Export audit snapshot” button → download `snapshot.json` + `audit_report.md` (client-side generation).

### Phase 4: ZK 合规证明前端流
18. **Proof 请求接口**
    - `useAuditController` (or new hook) to map proof types to transitions and build inputs (record ciphertext + public params).
19. **Proof 结果展示**
    - UI shows tx id + boolean result; allow attaching existing proof tx to multiple audit packages.
20. **Walletless 校验页**
    - Build read-only page: input `invoice_id` → call mapping endpoints to show existence/hash/status, no wallet required.

### Phase 5: 部署与配置
21. **Env & toggles**
    - `.env.local` update `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_LEGACY_PROGRAM_ID`; add feature flags for optional pieces (audit report, compute_invoice_id helper).
22. **Testnet 部署**
    - Deploy `zk_invoice_v2.aleo`; record program ID & deployment tx id into doc.
23. **Smoke 测试矩阵**
    - End-to-end: create → pay → audit verify (package v2) → one ZK proof; confirm mapping status transitions.
    - Cost measurement: capture fees for each tx; ensure total <0.05 credits target; log in doc.

### Phase 6: 文档与答辩资产
24. **Doc 对齐**
    - Update README/FAQ to include mapping rationale, privacy/compliance trade-offs, “commitment vs plaintext count” choice.
25. **Demo 物料**
    - Prepare slides screenshotting audit UI, walletless verify page, and exported snapshot files.
26. **Risk log**
    - Record open risks (SDK hash parity, finalize fee spikes) with mitigation steps; keep consistent with §9。

（以上步骤按编号顺序执行；可并行的仅在不破坏依赖的情况下进行。）

---

## 0. Wave 1 回顾与评审反馈

### 0.1 Wave 1 现状

| 维度 | 状态 |
|------|------|
| 合约架构 | 纯 Record（UTXO），无 mapping，无 async/finalize |
| 审计模型 | 完全链下（AuditPackage JSON + AES-GCM + wallet 签名） |
| 数据可验证性 | 审计员无法独立从链上验证，必须信任发送者提供的 JSON |
| 时间戳 | `created_at` 硬编码为 `0u32`（显示为 1970 年） |
| Invoice ID | 前端随机 nonce 与链上 `BHP256::hash(data)` 不一致 |

### 0.2 评审核心反馈

> "I noticed you mention that mappings for public data are not supported which is not true."

**结论**：Wave 1 放弃 mapping 的前提是错误的。Aleo testnet **完全支持** `async transition` + `async function` + `mapping`。`credits.aleo` 本身就在 testnet 上使用 `account` mapping。我们的 `AleoProtocolService.getProgramMappingValue()` 已经能读取链上 mapping，只是 `zk_invoice.aleo` 自身没有写入任何 mapping。

### 0.3 Wave 2 核心定位

从"私有发票工具"升级为 **"隐私优先、公共可验证的供应链金融审计平台"**。

关键转变：
- Record（私有）保持隐私 → **不变**
- Mapping（公共锚点）提供可验证性 → **新增**
- Off-chain Audit Package 提供选择性披露 → **保留并增强**
- ZK Proof 合规验证 → **新增**

---

## 1. 智能合约升级：引入 Mapping 公共锚点

### 1.1 设计哲学：最小化公共暴露

Mapping 中的数据对**全网可见**。因此我们只写入最小化的"锚点"数据——足以让第三方独立验证，但不泄露商业敏感信息。

**暴露的信息**：某个 `invoice_id` 存在、它的 `invoice_hash`、它的 `status`
**不暴露的信息**：金额、买卖双方地址、明细、行项目

### 1.2 新增 Mapping 定义

```leo
// 发票注册表：invoice_id => invoice_hash
// 用途：任何人可验证某张发票的哈希是否与链上一致
mapping invoice_registry: field => field;

// 发票状态表：invoice_id => status (u8)
// 用途：任何人可查询发票当前状态（PENDING/PAID/CANCELLED）
mapping invoice_status: field => u8;

// 发票计数器（可选）：seller_address => invoice_count
// 用途：审计员可验证某卖家的发票总数，防止隐藏发票
mapping invoice_count: address => u64;
```

**为什么不加 `auditor_permissions` mapping？**
授权关系上链意味着所有人都能看到"谁被授权审计谁"，这本身就是敏感的商业信息。权限管理保持在 off-chain audit package 中更合适。

### 1.3 Transition 改造：同步 → 异步

#### 1.3.1 `create_invoice` 改造

```leo
// 改造前：transition create_invoice(...) -> (InvoiceRecord, InvoiceRecord)
// 改造后：

async transition create_invoice(
    buyer: address,
    amount: u64,
    due_date: u32,
    invoice_hash: field,
    nonce: field,
    current_time: u32        // 新增：前端传入当前时间戳
) -> (InvoiceRecord, InvoiceRecord, Future) {
    let seller: address = self.caller;
    assert_neq(seller, buyer);
    assert(amount > 0u64);

    let invoice_data: InvoiceData = InvoiceData {
        seller: seller,
        buyer: buyer,
        amount: amount,
        due_date: due_date,
        invoice_number: nonce
    };
    let invoice_id: field = BHP256::hash_to_field(invoice_data);

    let seller_record: InvoiceRecord = InvoiceRecord {
        owner: seller,
        invoice_id: invoice_id,
        seller: seller,
        buyer: buyer,
        amount: amount,
        invoice_hash: invoice_hash,
        due_date: due_date,
        created_at: current_time,    // 使用前端传入的时间戳
        status: 0u8
    };

    let buyer_record: InvoiceRecord = InvoiceRecord {
        owner: buyer,
        invoice_id: invoice_id,
        seller: seller,
        buyer: buyer,
        amount: amount,
        invoice_hash: invoice_hash,
        due_date: due_date,
        created_at: current_time,
        status: 0u8
    };

    // 返回 Future 用于链上异步执行
    return (
        seller_record,
        buyer_record,
        finalize_create_invoice(invoice_id, invoice_hash, seller)
    );
}

async function finalize_create_invoice(
    public invoice_id: field,
    public invoice_hash: field,
    public seller: address
) {
    // 写入发票注册表
    Mapping::set(invoice_registry, invoice_id, invoice_hash);
    // 写入初始状态
    Mapping::set(invoice_status, invoice_id, 0u8); // PENDING
    // 更新卖家发票计数
    let current_count: u64 = Mapping::get_or_use(invoice_count, seller, 0u64);
    Mapping::set(invoice_count, seller, current_count + 1u64);
}
```

**关键设计决策**：
- `invoice_hash` 和 `invoice_id` 进入 finalize（公开），但 `amount`、`buyer` 不进入
- `seller` 进入 finalize 仅用于计数，不暴露与特定 invoice 的关联（因为 mapping key 是 `invoice_id` 不是 `seller`）
- `current_time` 作为 transition 参数由前端注入，解决 1970 时间戳问题

#### 1.3.2 `mark_as_paid` 改造

```leo
async transition mark_as_paid(
    invoice: InvoiceRecord,
    payment_nonce: field
) -> (PaymentRecord, InvoiceRecord, Future) {
    let payer: address = self.caller;
    assert_eq(payer, invoice.buyer);
    assert_eq(invoice.status, 0u8); // STATUS_PENDING

    let payment_data: PaymentData = PaymentData {
        invoice_id: invoice.invoice_id,
        payer: payer,
        payee: invoice.seller,
        payment_nonce: payment_nonce
    };
    let payment_id: field = BHP256::hash_to_field(payment_data);

    let receipt: PaymentRecord = PaymentRecord {
        owner: payer,
        payment_id: payment_id,
        invoice_id: invoice.invoice_id,
        payer: payer,
        payee: invoice.seller,
        amount: invoice.amount,
        paid_at: 0u32
    };

    let updated_invoice: InvoiceRecord = InvoiceRecord {
        owner: invoice.owner,
        invoice_id: invoice.invoice_id,
        seller: invoice.seller,
        buyer: invoice.buyer,
        amount: invoice.amount,
        invoice_hash: invoice.invoice_hash,
        due_date: invoice.due_date,
        created_at: invoice.created_at,
        status: 1u8 // STATUS_PAID
    };

    return (
        receipt,
        updated_invoice,
        finalize_mark_as_paid(invoice.invoice_id)
    );
}

async function finalize_mark_as_paid(
    public invoice_id: field
) {
    // 仅更新状态，不暴露金额或双方地址
    Mapping::set(invoice_status, invoice_id, 1u8); // PAID
}
```

#### 1.3.3 `cancel_invoice` 改造

```leo
async transition cancel_invoice(
    invoice: InvoiceRecord
) -> (InvoiceRecord, Future) {
    let caller: address = self.caller;
    assert_eq(caller, invoice.seller);
    assert_eq(invoice.status, 0u8);

    let cancelled_invoice: InvoiceRecord = InvoiceRecord {
        owner: invoice.owner,
        invoice_id: invoice.invoice_id,
        seller: invoice.seller,
        buyer: invoice.buyer,
        amount: invoice.amount,
        invoice_hash: invoice.invoice_hash,
        due_date: invoice.due_date,
        created_at: invoice.created_at,
        status: 2u8 // STATUS_CANCELLED
    };

    return (
        cancelled_invoice,
        finalize_cancel_invoice(invoice.invoice_id)
    );
}

async function finalize_cancel_invoice(
    public invoice_id: field
) {
    Mapping::set(invoice_status, invoice_id, 2u8); // CANCELLED
}
```

#### 1.3.4 不需要改造的 Transition

| Transition | 是否需要 async | 原因 |
|-----------|---------------|------|
| `verify_invoice` | 否 | 纯计算，不写入公共状态 |
| `verify_payment` | 否 | 纯计算，不写入公共状态 |
| `create_seller_receipt` | 否 | 只创建 Record，状态已在 `mark_as_paid` 中更新 |

### 1.4 Mapping 约束与注意事项

根据 Leo 官方文档：
- 单个合约最多 **31 个 mapping**（我们只用 3 个，远低于上限）
- Mapping 操作**只能在 `async function` 中执行**，不能在 transition 主体中直接调用
- async function 是**原子的**：要么全部成功，要么全部回滚
- **不能修改其他程序的 mapping**，但可以**读取**其他程序的 mapping
- 最大交易体积 128 KB，最大链上执行费 100,000,000 microcredits

### 1.5 合约重部署策略

Aleo 合约一旦部署**不可升级**（除非使用 `@upgradeable` constructor，但我们用的是 `@noupgrade`）。

**方案**：部署新的 program ID（例如 `zk_invoice_v2.aleo`），前端切换到新合约地址。旧合约的 Record 不可迁移，但链上数据仍可查询。

**program.json 变更**：
```json
{
  "program": "zk_invoice_v2.aleo",
  "version": "0.2.0",
  "description": "Privacy-preserving B2B invoice system with public anchors",
  "leo": "3.4.0",
  "dependencies": [
    {
      "name": "credits.aleo",
      "location": "network"
    }
  ]
}
```

---

## 2. 前端服务层适配

### 2.1 AleoProtocolService 扩展

现有的 `getProgramMappingValue()` 已经能读取 mapping，只需要添加便捷方法：

```typescript
// services/AleoProtocolService/IAleoProtocolService.ts 新增接口

// 查询发票链上哈希
getInvoiceHash(invoiceId: AleoField): Promise<AleoField | null>;

// 查询发票链上状态
getInvoiceStatus(invoiceId: AleoField): Promise<InvoiceStatus | null>;

// 查询卖家发票总数
getInvoiceCount(seller: AleoAddress): Promise<number>;

// 批量验证：对比本地哈希与链上哈希
verifyInvoiceOnChain(invoiceId: AleoField, localHash: AleoField): Promise<{
  exists: boolean;
  hashMatch: boolean;
  chainStatus: InvoiceStatus | null;
}>;
```

**实现要点**：
- 底层调用 `getProgramMappingValue('zk_invoice_v2.aleo', 'invoice_registry', invoiceId)`
- 返回值需要清理 Aleo 类型后缀（如 `"123field"` → `"123field"` 已有逻辑处理）
- `invoice_status` 返回的 `u8` 需要映射到 `InvoiceStatus` 枚举

### 2.2 Transaction 构建变更

`async transition` 的返回值多了一个 `Future`，前端调用方式需要适配：

```typescript
// controller/Transaction/useTransactionController.ts

// 改造前：inputs = [buyer, amount, due_date, invoice_hash, nonce]
// 改造后：
const inputs = [
  buyerAddress,
  `${microcredits}u64`,
  `${dueDateTimestamp}u32`,
  `${invoiceHash}field`,
  `${nonce}field`,
  `${Math.floor(Date.now() / 1000)}u32`  // current_time 新参数
];

// requestTransaction 的 function name 不变，但合约 programId 需更新
const txPayload = {
  programId: 'zk_invoice_v2.aleo',    // 新合约 ID
  functionName: 'create_invoice',
  inputs: inputs,
  fee: estimatedFee
};
```

**注意**：Wallet adapter 对 `async transition` 的交易构建是透明的——从前端角度，调用方式与普通 transition 基本一致，区别只在于链上执行会额外触发 finalize。前端不需要显式处理 `Future` 对象。

### 2.3 Polling 增强：Mapping 状态同步

当前 polling 只扫描 Record。引入 mapping 后，可以增加一条更轻量的验证路径：

```typescript
// controller/Invoice/useInvoicePollingCore.ts 增强

async function pollInvoiceStatus(invoiceId: AleoField): Promise<{
  recordConfirmed: boolean;
  mappingConfirmed: boolean;
  chainStatus: InvoiceStatus | null;
}> {
  // 并行执行：Record 扫描 + Mapping 查询
  const [recordResult, statusResult] = await Promise.all([
    scanChainForRecord(invoiceId),            // 现有逻辑
    protocolService.getInvoiceStatus(invoiceId) // 新增 mapping 查询
  ]);

  return {
    recordConfirmed: recordResult !== null,
    mappingConfirmed: statusResult !== null,
    chainStatus: statusResult
  };
}
```

**好处**：Mapping 查询是简单的 RPC GET，比 Record 扫描（需要遍历 + 解密）快得多。可以先用 mapping 确认交易已上链，再用 Record 扫描获取完整数据。

### 2.4 前端 Invoice ID 一致性修复

**问题**：前端用随机 nonce 作为显示 ID，链上用 `BHP256::hash(InvoiceData)` 作为 `invoice_id`。

**方案**：前端在交易发出前，本地复刻 BHP256 哈希计算，预先得到 `invoice_id`。

```typescript
// services/CryptoService/CryptoServiceImpl.ts 新增

import { hashToField } from '@provablehq/sdk'; // 或对应的 SDK 方法

async computeInvoiceId(params: {
  seller: AleoAddress;
  buyer: AleoAddress;
  amount: Microcredits;
  dueDate: number;
  nonce: AleoField;
}): Promise<AleoField> {
  // 构造与 Leo 合约中 InvoiceData 完全一致的结构
  // 使用 @provablehq/sdk 的 BHP256 hash_to_field
  const invoiceData = {
    seller: params.seller,
    buyer: params.buyer,
    amount: params.amount,
    due_date: params.dueDate,
    invoice_number: params.nonce
  };
  return hashToField(invoiceData); // 需要确认 SDK 是否暴露此方法
}
```

**备选方案**：如果 SDK 不直接暴露 `BHP256::hash_to_field`，可以在合约中新增一个纯 transition 专门用于预计算：

```leo
transition compute_invoice_id(
    seller: address,
    buyer: address,
    amount: u64,
    due_date: u32,
    nonce: field
) -> field {
    let data: InvoiceData = InvoiceData {
        seller: seller,
        buyer: buyer,
        amount: amount,
        due_date: due_date,
        invoice_number: nonce
    };
    return BHP256::hash_to_field(data);
}
```

前端先调用此 transition 获取 ID，再发起 `create_invoice`。缺点是多一次交易（但可以在本地执行，不需要上链）。

---

## 3. 审计系统升级：链上锚点 + 链下披露

### 3.1 升级后的审计模型

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Wave 2 审计验证模型                               │
│                                                                      │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐  │
│  │   链上公共锚点        │     │   链下选择性披露                   │  │
│  │   (Mapping)           │     │   (Audit Package)                │  │
│  │                       │     │                                  │  │
│  │ invoice_registry:     │     │ AuditPackage JSON:               │  │
│  │   id → hash           │     │   - 加密的发票明细                │  │
│  │                       │     │   - 权限范围                     │  │
│  │ invoice_status:       │     │   - 时间限制                     │  │
│  │   id → status         │     │   - 钱包签名                     │  │
│  │                       │     │                                  │  │
│  │ invoice_count:        │     │ Audit Key:                       │  │
│  │   seller → count      │     │   - 32 字节随机密钥               │  │
│  └──────────┬───────────┘     └──────────────┬───────────────────┘  │
│             │                                 │                      │
│             │     ┌───────────────────────┐   │                      │
│             └────►│   审计员验证流程       │◄──┘                      │
│                   │                       │                          │
│                   │ 1. 查链上 mapping     │                          │
│                   │    → invoice 存在?    │                          │
│                   │    → hash 匹配?       │                          │
│                   │    → status 正确?     │                          │
│                   │                       │                          │
│                   │ 2. 解密 audit package │                          │
│                   │    → 验证 hash 一致   │                          │
│                   │    → 查看授权字段     │                          │
│                   │                       │                          │
│                   │ 3. 结论：             │                          │
│                   │    链上锚点 ✓         │                          │
│                   │    链下明细 ✓         │                          │
│                   │    → 可信且隐私       │                          │
│                   └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 审计验证流程改造

```typescript
// lib/audit.ts — validateAuditPackage 增强

export async function validateAuditPackage(params: {
  pkg: AuditPackage;
  auditKey: string;
  protocolService: IAleoProtocolService;  // 新增：用于链上查询
}): Promise<AuditValidationResult> {
  const { pkg, auditKey, protocolService } = params;

  // === 阶段 1：包完整性检查（现有逻辑，不变） ===
  // 1a. 检查过期
  if (Date.now() > pkg.expiresAt) {
    return { valid: false, reason: 'EXPIRED' };
  }
  // 1b. cipher hash 完整性
  const recomputedHash = await hashCipher(pkg.cipher);
  if (recomputedHash !== pkg.cipherHash) {
    return { valid: false, reason: 'TAMPERED' };
  }
  // 1c. 解密
  const decrypted = await decryptWithAuditKey(pkg.cipher, auditKey);

  // === 阶段 2：链上锚点验证（新增） ===
  // 2a. 查询链上 invoice_registry
  const chainHash = await protocolService.getInvoiceHash(pkg.invoiceId);
  if (chainHash === null) {
    return {
      valid: false,
      reason: 'INVOICE_NOT_FOUND_ON_CHAIN',
      decrypted  // 仍然返回解密数据供参考
    };
  }

  // 2b. 对比链上哈希与包中声明的哈希
  if (chainHash !== pkg.invoiceHash) {
    return {
      valid: false,
      reason: 'HASH_MISMATCH_WITH_CHAIN',
      decrypted
    };
  }

  // 2c. 查询链上状态
  const chainStatus = await protocolService.getInvoiceStatus(pkg.invoiceId);

  // 2d. 从解密数据重新计算哈希，与链上哈希对比
  const recomputedInvoiceHash = await computeInvoiceHash(decrypted);
  if (recomputedInvoiceHash !== chainHash) {
    return {
      valid: false,
      reason: 'DECRYPTED_DATA_HASH_MISMATCH',
      decrypted
    };
  }

  // === 阶段 3：全部通过 ===
  return {
    valid: true,
    decrypted,
    chainVerification: {                // 新增返回字段
      invoiceExistsOnChain: true,
      hashMatchesChain: true,
      chainStatus: chainStatus,
    }
  };
}
```

### 3.3 AuditPackage 格式升级

```typescript
// lib/types.ts — AuditPackage v2

export interface AuditPackageV2 {
  version: 2;                          // 版本升级
  programId: string;                   // 新增：合约 ID（用于链上查询定位）
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  expiresAt: number;
  auditorAddress: AleoAddress;
  issuedAt: number;
  signerAddress: AleoAddress;
  cipher: EncryptedPayload;
  cipherHash: string;
  signature: string;
  chainVerifiable: boolean;            // 新增：标记此发票是否可链上验证
}
```

向后兼容：`version: 1` 的包仍按旧逻辑验证（跳过链上查询步骤）。

### 3.4 Audit UI 增强

`app/(app)/audit/page.tsx` 验证面板需要展示新的链上验证结果：

```
┌──────────────────────────────────────────────────────┐
│  Audit Validation Result                             │
│                                                      │
│  Package Integrity          ✅ Passed                │
│  Cipher Hash                ✅ Matched               │
│  Decryption                 ✅ Success               │
│                                                      │
│  ── Chain Verification (NEW) ──                      │
│  Invoice On-Chain           ✅ Found                 │
│  Hash Match                 ✅ Chain hash matches    │
│  Chain Status               🟢 PAID                  │
│  Invoice Hash Recompute     ✅ Consistent            │
│                                                      │
│  Disclosed Fields:                                   │
│  - Amount: 1,500.00 credits                          │
│  - Tax Rate: 10%                                     │
│  - Tax Amount: 150.00 credits                        │
│                                                      │
│  Confidence: HIGH (chain-verified + package-valid)   │
└──────────────────────────────────────────────────────┘
```

---

## 4. ZK 合规证明：链上隐私计算

### 4.1 设计目标

审计员需要验证"某些计算是否正确"，但**不需要知道具体数值**。这是 ZK 最核心的价值主张。

### 4.2 合规验证 Transition

#### 4.2.1 税率合规证明

```leo
// 证明：发票的税额 = 金额 * 指定税率 / 100
// 审计员只知道"税率是否合规"，不知道具体金额
transition prove_tax_compliance(
    private invoice: InvoiceRecord,
    public expected_tax_rate_bps: u64,   // 基点（basis points），如 1000 = 10%
    private actual_tax_amount: u64       // 发票中的实际税额（私有输入）
) -> bool {
    // 计算期望税额：amount * rate / 10000
    let expected_tax: u64 = invoice.amount * expected_tax_rate_bps / 10000u64;
    // 验证实际税额是否等于期望税额
    return actual_tax_amount == expected_tax;
}
```

**输入/输出分析**：
- `invoice`：private → 金额不暴露
- `expected_tax_rate_bps`：public → 审计员指定要验证的税率
- `actual_tax_amount`：private → 实际税额不暴露
- 返回值：`bool` → 只暴露"合规/不合规"

#### 4.2.2 金额范围证明

```leo
// 证明：发票金额在某个范围内
// 场景：监管要求大额交易（>10000 credits）需要额外申报
transition prove_amount_in_range(
    private invoice: InvoiceRecord,
    public min_amount: u64,
    public max_amount: u64
) -> bool {
    let above_min: bool = invoice.amount >= min_amount;
    let below_max: bool = invoice.amount <= max_amount;
    return above_min && below_max;
}
```

#### 4.2.3 发票真实性证明

```leo
// 证明：我确实持有某张发票，且其哈希与链上一致
// 不暴露发票内容，只暴露 invoice_id（用于链上查询）
async transition prove_invoice_ownership(
    private invoice: InvoiceRecord
) -> (bool, Future) {
    // 证明 caller 是发票的 seller 或 buyer
    let is_seller: bool = self.caller == invoice.seller;
    let is_buyer: bool = self.caller == invoice.buyer;
    let is_party: bool = is_seller || is_buyer;

    return (
        is_party,
        finalize_prove_ownership(invoice.invoice_id, invoice.invoice_hash)
    );
}

async function finalize_prove_ownership(
    public invoice_id: field,
    public claimed_hash: field
) {
    // 从 mapping 中读取链上哈希并验证一致性
    let chain_hash: field = Mapping::get(invoice_registry, invoice_id);
    assert_eq(chain_hash, claimed_hash);
}
```

**这个 transition 的价值**：审计员可以要求某人"证明你确实是这张发票的参与方"，被证明者执行此 transition，链上的 ZK proof 验证成功即可证明——全程不暴露发票的金额、对手方等信息。

### 4.3 合规验证前端集成

```typescript
// controller/Audit/useAuditController.ts 新增

async function requestComplianceProof(params: {
  proofType: 'tax_compliance' | 'amount_range' | 'ownership';
  invoiceRecord: string;  // 加密的 record ciphertext
  publicInputs: Record<string, string>;
}): Promise<{
  proofValid: boolean;
  transactionId: AleoTransactionId;
}> {
  const functionMap = {
    tax_compliance: 'prove_tax_compliance',
    amount_range: 'prove_amount_in_range',
    ownership: 'prove_invoice_ownership'
  };

  const result = await walletService.requestTransaction({
    programId: 'zk_invoice_v2.aleo',
    functionName: functionMap[params.proofType],
    inputs: [params.invoiceRecord, ...Object.values(params.publicInputs)],
    fee: estimatedFee
  });

  return {
    proofValid: result.outputs[0] === 'true',
    transactionId: result.transactionId
  };
}
```

---

## 5. 全生命周期业务扩展

### 5.1 Record 结构演进

#### 5.1.1 InvoiceRecord 增强

```leo
record InvoiceRecord {
    owner: address,
    invoice_id: field,
    seller: address,
    buyer: address,
    amount: u64,
    invoice_hash: field,
    due_date: u32,
    created_at: u32,           // 修复：由前端传入真实时间戳
    status: u8,
    order_id: field,           // 新增：关联的订单 ID（无则为 0field）
    tax_amount: u64,           // 新增：税额（用于 ZK 合规验证）
}
```

**为什么把 `tax_amount` 放入 Record？**
`prove_tax_compliance` transition 需要读取 record 中的税额字段来做 ZK 验证。如果税额只在链下的 `InvoiceDetails` 中，合约无法访问。

#### 5.1.2 新增 AuditReport Record（可选）

```leo
// 审计报告 Record：记录某次合规验证的结果
record AuditReport {
    owner: address,           // 审计员
    invoice_id: field,        // 被审计的发票
    audit_type: u8,           // 0=tax, 1=range, 2=ownership
    result: bool,             // 合规/不合规
    audited_at: u32,          // 审计时间
    auditor: address,         // 审计员地址
}
```

需要新增 transition：
```leo
async transition submit_audit_report(
    invoice_id: field,
    audit_type: u8,
    result: bool,
    current_time: u32
) -> (AuditReport, Future) {
    let report: AuditReport = AuditReport {
        owner: self.caller,
        invoice_id: invoice_id,
        audit_type: audit_type,
        result: result,
        audited_at: current_time,
        auditor: self.caller
    };

    return (report, finalize_audit_report(invoice_id, self.caller));
}

async function finalize_audit_report(
    public invoice_id: field,
    public auditor: address
) {
    // 可选：记录审计次数等公共统计
    // 注意：这里不记录审计结果（result），因为那是私有的
}
```

### 5.2 状态流转增强

```
            ┌──────────────┐
            │   PENDING    │ ◄── create_invoice()
            └──────┬───────┘
                   │
             ┌─────┴─────┐
             │           │
             ▼           ▼
       ┌─────────┐  ┌───────────┐
       │  PAID   │  │ CANCELLED │
       └────┬────┘  └───────────┘
            │
            ▼
       ┌───────────────┐
       │  AUDIT READY  │ ◄── 链上有锚点，可接受合规验证请求
       └───────────────┘
```

"AUDIT READY"不是一个新的链上状态，而是一个前端派生状态：当 `invoice_status` mapping 中存在该发票且状态为 PAID 时，前端标记为可审计。

### 5.3 PurchaseOrder（订单）— 降优先级

WAVE2_DESIGN.md 中提到了 PurchaseOrder Record。建议 Wave 2 **暂不实现**，原因：
- 增加合约复杂度，但核心价值在审计而非订单管理
- 可以用 `order_id: field` 字段预留扩展点
- 订单逻辑可在 Wave 3 独立合约中实现并通过 cross-program call 关联

---

## 6. 前端架构调整

### 6.1 目录结构（最小改动原则）

不建议 Wave 2 做大规模的目录重构（如 WAVE2_DESIGN.md 中提到的 DDD 结构），避免引入不必要的变更风险。建议的增量调整：

```
services/
  AleoProtocolService/
    AleoProtocolServiceImpl.ts   ← 新增 mapping 查询方法
    IAleoProtocolService.ts      ← 新增接口定义
  CryptoService/
    CryptoServiceImpl.ts         ← 新增 computeInvoiceId()

lib/
  audit.ts                       ← 增强 validateAuditPackage（链上验证）
  types.ts                       ← AuditPackageV2 类型定义

controller/
  Audit/
    useAuditController.ts        ← 新增合规证明请求方法
    useComplianceProof.ts        ← 新增：合规验证 hook（可选独立文件）
  Transaction/
    useTransactionController.ts  ← 适配 async transition 参数变更

app/(app)/
  audit/page.tsx                 ← 增强验证面板 UI
  compliance/page.tsx            ← 新增：合规验证页面（可选）
```

### 6.2 状态管理增量

```typescript
// stores/Invoice/useInvoiceStore.ts 新增字段

interface InvoiceStoreState {
  // ... 现有字段不变

  // 新增：链上 mapping 缓存
  chainStatusCache: Record<AleoField, {
    status: InvoiceStatus;
    hash: AleoField;
    lastQueried: number;
  }>;

  // 新增操作
  updateChainStatus: (invoiceId: AleoField, status: InvoiceStatus, hash: AleoField) => void;
  getChainStatus: (invoiceId: AleoField) => InvoiceStatus | null;
}
```

### 6.3 环境变量更新

```env
# .env.local
NEXT_PUBLIC_ALEO_NETWORK=testnet
NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v2.aleo    # 新合约 ID
NEXT_PUBLIC_LEGACY_PROGRAM_ID=zk_invoice.aleo # 旧合约（用于历史查询）
```

---

## 7. 关于 View Key 的澄清

### 7.1 View Key 在 Aleo 中的真实含义

WAVE2_DESIGN.md 4.2 节提到"基于 View Key 的被动审计"。需要澄清：

- Aleo 的密钥层级：**Private Key → View Key → Address**
- View Key 可以解密**该地址拥有的所有 Record**
- View Key 是**全有或全无的**——你无法只分享"某一笔交易的 view key"
- 如果把 View Key 给审计员，审计员能看到你**所有的**发票、付款记录、credits 余额

### 7.2 为什么不用 View Key

| 维度 | View Key 分享 | Off-chain Audit Package |
|------|--------------|------------------------|
| 粒度 | 全部 Record | 单笔发票、单个字段 |
| 时效 | 永久（除非换地址） | 可设置过期时间 |
| 可撤销性 | 不可撤销 | 过期即失效 |
| 隐私风险 | 极高（暴露所有资产） | 最小化（只暴露授权字段） |

**结论**：View Key 分享方案**不适合**我们的场景。保持 off-chain audit package + 链上锚点验证的混合方案。

### 7.3 但 View Key 有一个合理用途

在 `AleoProtocolService` 中，我们调用 `walletService.getViewKey()` 来解密本用户自己的 Record。这是 View Key 的正确使用方式——**自解密**，而非分享给他人。

---

## 8. 合约测试计划

### 8.1 新增测试用例（追加到 tests/test_zk_invoice.leo）

```
// Mapping 写入验证
@test test_create_invoice_writes_to_registry
@test test_create_invoice_writes_pending_status
@test test_create_invoice_increments_count
@test test_mark_as_paid_updates_status_to_paid
@test test_cancel_invoice_updates_status_to_cancelled

// Mapping 读取验证
@test test_registry_hash_matches_record_hash
@test test_status_reflects_latest_transition

// Async/Finalize 原子性
@test test_finalize_failure_reverts_mapping_changes

// 合规证明
@test test_tax_compliance_correct_rate_returns_true
@test test_tax_compliance_wrong_rate_returns_false
@test test_amount_range_within_returns_true
@test test_amount_range_outside_returns_false
@test test_ownership_proof_seller_succeeds
@test test_ownership_proof_buyer_succeeds
@test test_ownership_proof_stranger_fails

// 时间戳
@test test_created_at_uses_input_timestamp

// 向后兼容
@test test_existing_transitions_unchanged_behavior
```

### 8.2 前端集成测试

```
// services/AleoProtocolService/__tests__/
test_getInvoiceHash_returns_correct_value
test_getInvoiceStatus_returns_correct_enum
test_getInvoiceCount_returns_number
test_verifyInvoiceOnChain_full_flow

// lib/__tests__/audit.test.ts 增强
test_validateAuditPackage_with_chain_verification
test_validateAuditPackage_invoice_not_on_chain
test_validateAuditPackage_hash_mismatch_with_chain
test_validateAuditPackage_v1_backward_compatible
```

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解方案 |
|------|------|------|---------|
| async transition 部署失败（编译/费用问题） | 中 | 高 | 先在本地 `leo run` 验证，再部署到 testnet；预留足够的 deployment fee |
| Mapping 数据泄露超出预期 | 低 | 中 | 严格只写入 invoice_id/hash/status，绝不写入金额和地址（invoice_count 中的 seller 地址除外，这是有意的设计） |
| 前端 BHP256 哈希计算与链上不一致 | 中 | 高 | 使用 `@provablehq/sdk` 提供的原生哈希方法；如果 SDK 不支持，使用合约辅助 transition |
| 旧合约数据迁移 | 确定 | 中 | 不迁移旧数据，前端支持同时查询新旧两个合约 |
| Finalize 执行失败导致 Record 已创建但 Mapping 未写入 | 低 | 高 | async function 是原子的——如果 finalize 失败，整个交易回滚（包括 Record 创建）。但需要前端正确处理交易失败重试 |

---

## 10. 实施优先级排序

### P0 — 必须完成（直接回应评审反馈）

1. **合约引入 mapping + async transition**（第 1 章）
2. **审计验证增加链上锚点查询**（第 3.2 节）
3. **修复时间戳 0u32 问题**（第 1.3.1 节 `current_time` 参数）

### P1 — 强烈建议（显著提升竞争力）

4. **ZK 合规证明（税率 + 金额范围）**（第 4 章）
5. **Invoice ID 前后端一致性修复**（第 2.4 节）
6. **AuditPackage v2 格式 + 链上验证 UI**（第 3.3-3.4 节）

### P2 — 锦上添花

7. **AuditReport Record**（第 5.1.2 节）
8. **InvoiceRecord 增加 tax_amount 字段**（第 5.1.1 节）
9. **invoice_count mapping**（第 1.2 节）
10. **Compliance 专用页面**（第 6.1 节）

### P3 — 可延迟到 Wave 3

11. PurchaseOrder 订单系统
12. 目录结构 DDD 重构
13. 跨合约调用（cross-program）

---

## 11. B2B/B2C 产品化与审计平台化路径

### 11.1 覆盖的业务生命周期（面向审计）
- Issue → Accept → Pay → Reconcile → Audit → Archive；Wave 2 先覆盖前 4 步 + 审计入口，Archive/Retention 仅做链上锚点保存。
- 补齐争议/更正信号：短期用 off-chain 记录 + audit package 中的 dispute flag；Wave 3 再考虑 `credit_note`/`adjustment` transition。

### 11.2 B2B 增强点
- 多角色工作区：issuer（开票）、cashier/finance（对账）、auditor（内审/外审）的前端权限分层，只影响 UI 与 API，不上链。
- 供应商视角的指标：`invoice_count` mapping 可量化发票量，但暴露 seller 地址。若需降低暴露，可增加可选的承诺式计数 `invoice_count_commit: field => u64`（key = `BHP256::hash_to_field(seller || epoch || salt)`，salt 仅在审计时披露），与明文计数二选一。
- 对账加速：通过 mapping `invoice_status` 先判定链上状态，再解密 Record，减少企业侧节点计算。

### 11.3 B2C 场景切片
- 轻量“电子小票”模式：仅哈希化 `amount`、`merchant_id`、`timestamp` 写入 `invoice_registry`/`status`；用户手机号/邮箱不进链，放入 audit package 授权披露。
- Walletless 校验：商家开票后展示 QR，消费者用只读页面调用 `getInvoiceStatus`/`getInvoiceHash` 做真伪校验；不要求持有 Aleo 钱包。

### 11.4 审计工具一体化（差异化卖点）
- 审计请求模板：UI 预置 `tax_compliance`、`amount_range`、`ownership` 三类 ZK 请求，自动调用对应 transition 并收集 tx id 作为证据链。
- 链上锚点快照：生成 `snapshot.json`（包含 invoice_id、hash、status、tx ids）+ `audit_report.md`（链下），可一键打包提交给评委/审计方。
- 证明复用：同一发票的链上证明 tx id 可附着到多个 audit package，减少重复链上开销。

### 11.5 Wave 2 的落地最小集（针对比赛竞争力）
1) 已有 P0：mapping + async + 时间戳修复。
2) AuditPackage v2 + 链上验证 UI（P1）。
3) 至少实现 1 个 ZK 审计请求模板（推荐 `prove_tax_compliance`）。
4) 前端支持“审计快照导出”按钮，导出上述 snapshot + 披露字段列表。
5) B2C 轻量校验页（只读，无需钱包）复用 mapping 查询。
6) 文档中明确“承诺式计数”与明文计数的取舍，比赛答辩可解释隐私/可验证的权衡。

### 11.6 成功度量（对外叙事）
- TTV（time to verify）：从拿到 audit package 到确认链上状态 ≤ 30 秒。
- 链上成本：完成一套“开票+支付+一次合规证明”总费用 < 0.05 credits（需上线前实测）。
- 审计覆盖率：可链上独立验证的发票占比 ≥ 90%（剩余 10% 允许 legacy/v1）。

---

## 12. 一句话总结

> **Wave 2 的核心升级是：在保持 Record 隐私性不变的前提下，通过 Mapping 公共锚点让审计员可以独立验证链上数据，通过 ZK 合规证明让审计员在不看到具体数值的情况下验证业务规则——将"信任发送者"升级为"信任数学"。**
