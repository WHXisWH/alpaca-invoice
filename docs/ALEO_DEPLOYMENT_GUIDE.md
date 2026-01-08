# Aleo Program 部署指南
## ZK-Invoice 项目 | Testnet Deployment Guide

**版本**: 1.0
**更新日期**: 2026-01-09
**部署网络**: Aleo Testnet
**已部署合约**: `zk_invoice.aleo`
**交易ID**: `at19wjr8krkxg33ykjmhunrufzrmk53n2r6qew9ynznu9mzldvmg5xqyayedc`

---

## 目录

- [部署结果总结](#部署结果总结)
- [环境准备](#环境准备)
- [合约架构说明](#合约架构说明)
- [编译与部署流程](#编译与部署流程)
- [前端集成指南](#前端集成指南)
- [关键经验与教训](#关键经验与教训)
- [故障排查](#故障排查)

---

## 部署结果总结

### ✅ 成功部署的合约

**Program Name**: `zk_invoice.aleo`
**Program ID**: [zk_invoice.aleo on Aleo Explorer](https://api.explorer.provable.com/v1/testnet/program/zk_invoice.aleo)
**Deployment Status**: ✅ Confirmed
**Deployment Cost**: 8.212371 credits
**Network**: Testnet

### 📊 合约复杂度

| 指标 | 数值 | 最大限制 | 占用率 |
|-----|------|---------|--------|
| Variables | 523,336 | 2,097,152 | 24.9% |
| Constraints | 425,035 | 2,097,152 | 20.3% |

### 🎯 实现的功能

| Function | 描述 | 状态 |
|----------|-----|------|
| `create_invoice` | 创建发票，返回双份 InvoiceRecord（卖家/买家） | ✅ |
| `verify_invoice` | 验证发票哈希的真实性 | ✅ |
| `mark_as_paid` | 标记发票为已支付，生成支付凭证 | ✅ |
| `create_seller_receipt` | 为卖家生成支付收据 | ✅ |
| `cancel_invoice` | 卖家取消待支付发票 | ✅ |
| `verify_payment` | 验证支付收据与发票的匹配关系 | ✅ |

### ⚠️ 重要设计变更

**原因**: Aleo Testnet 对包含 `async transition + finalize + mappings` 的程序有部署限制。

**解决方案**: 采用纯 Record-based 架构（UTXO 模型），所有状态存储在 Record 中。

**影响**:
- ❌ 无法在链上全局防止双重支付
- ❌ 无发票状态的全局索引
- ✅ 完全隐私（状态仅在 record holder 之间可见）
- ✅ 满足核心业务需求（创建、支付、取消、验证）

---

## 环境准备

### 1. 安装 Leo CLI

```bash
# 安装 Leo (macOS/Linux)
curl -L https://raw.githubusercontent.com/AleoHQ/aleo/testnet/install.sh | bash

# 验证安装
leo --version
# Expected: leo-lang 3.4.0
```

### 2. 安装 snarkOS CLI

```bash
# 安装 snarkOS
cargo install snarkos --locked

# 验证安装
snarkos --version
# Expected: snarkos 4.4.0
```

### 3. 配置 Aleo 账户

创建 `.env` 文件（**永远不要提交到 Git**）：

```bash
# .env
ALEO_PRIVATE_KEY=APrivateKey1zkp...
ALEO_VIEW_KEY=AViewKey1...
ALEO_ADDRESS=aleo1...
ALEO_NETWORK=testnet
ALEO_EXPLORER_API=https://api.explorer.provable.com/v1
```

### 4. 获取测试币

**Faucet 地址**: (通过 Aleo Discord 申请)
**建议余额**: 最少 15 credits（用于部署中等复杂度合约）

查询余额：
```bash
curl -s "https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/YOUR_ADDRESS" | jq '.'
```

---

## 合约架构说明

### 数据结构

#### Records (私密状态)

**InvoiceRecord** - 发票记录
```leo
record InvoiceRecord {
    owner: address,        // Record 持有者
    invoice_id: field,     // 唯一发票ID（通过哈希生成）
    seller: address,       // 卖家地址
    buyer: address,        // 买家地址
    amount: u64,           // 金额（microcredits）
    invoice_hash: field,   // 发票内容哈希（用于验证）
    due_date: u32,         // 到期时间
    created_at: u32,       // 创建时间
    status: u8             // 状态：0=PENDING, 1=PAID, 2=CANCELLED
}
```

**PaymentRecord** - 支付凭证
```leo
record PaymentRecord {
    owner: address,        // 收据持有者
    payment_id: field,     // 支付ID
    invoice_id: field,     // 关联的发票ID
    payer: address,        // 付款方
    payee: address,        // 收款方
    amount: u64,           // 支付金额
    paid_at: u32           // 支付时间
}
```

#### Structs (辅助数据)

**InvoiceData** - 用于生成 invoice_id
```leo
struct InvoiceData {
    seller: address,
    buyer: address,
    amount: u64,
    due_date: u32,
    invoice_number: field  // Nonce for uniqueness
}
```

**PaymentData** - 用于生成 payment_id
```leo
struct PaymentData {
    invoice_id: field,
    payer: address,
    payee: address,
    payment_nonce: field
}
```

### 业务流程

#### 流程 1: 创建发票

```
Seller (卖家)
    ↓
调用 create_invoice(buyer, amount, due_date, invoice_hash, nonce)
    ↓
生成 invoice_id = BHP256::hash(InvoiceData)
    ↓
返回两个 InvoiceRecord:
    - seller_record (owner=seller)
    - buyer_record (owner=buyer)
```

#### 流程 2: 支付发票（两步流程）

**步骤 1: 实际转账（前端直接调用）**
```
Buyer → credits.aleo/transfer_private(payment_record, seller, amount)
        → 获得转账证明
```

**步骤 2: 标记为已支付**
```
Buyer
    ↓
调用 mark_as_paid(invoice_record, payment_nonce)
    ↓
验证：caller == invoice.buyer && status == PENDING
    ↓
返回：
    - PaymentRecord (买家收据)
    - Updated InvoiceRecord (status=PAID)
```

**步骤 3: 卖家生成收据**
```
Seller
    ↓
调用 create_seller_receipt(invoice_id, payer, payee, amount, payment_nonce)
    ↓
返回：PaymentRecord (卖家收据)
```

#### 流程 3: 取消发票

```
Seller
    ↓
调用 cancel_invoice(invoice_record)
    ↓
验证：caller == invoice.seller && status == PENDING
    ↓
返回：Updated InvoiceRecord (status=CANCELLED)
```

---

## 编译与部署流程

### Step 1: 项目结构

```
zk-invoice/
├── src/
│   └── main.leo          # 主合约文件
├── program.json          # Leo 项目配置
├── .env                  # 环境变量（不提交到 Git）
└── build/                # 编译输出目录
```

**program.json 示例**:
```json
{
  "program": "zk_invoice.aleo",
  "version": "0.1.0",
  "description": "Privacy-preserving B2B invoice system",
  "license": "MIT",
  "leo": "3.4.0",
  "dependencies": [
    {
      "name": "credits.aleo",
      "location": "network",
      "path": null,
      "edition": null
    }
  ],
  "dev_dependencies": null
}
```

### Step 2: 编译合约

```bash
# 清理旧编译结果
leo clean

# 编译合约
leo build

# 预期输出：
# ✅ Compiled 'zk_invoice.aleo' into Aleo instructions.
```

**编译输出位置**: `build/main.aleo`

### Step 3: 本地测试（可选但推荐）

```bash
# 测试 create_invoice
leo run create_invoice \
  aleo1buyer_address... \
  1000000u64 \
  1735689600u32 \
  123456789field \
  987654321field

# 测试 verify_invoice
leo run verify_invoice \
  '{...invoice_record...}' \
  123456789field
```

### Step 4: 部署到 Testnet

#### 方法 A: 使用公共余额（推荐）

```bash
leo deploy \
  --network testnet \
  --endpoint https://api.explorer.provable.com/v1 \
  --save /tmp \
  --yes
```

**说明**:
- `--network testnet`: 指定部署到测试网
- `--endpoint`: Aleo testnet API 端点
- `--save /tmp`: 保存交易 JSON 到 /tmp 目录
- `--yes`: 自动确认（非交互模式）

#### 方法 B: 使用私有余额

```bash
leo deploy \
  --network testnet \
  --endpoint https://api.explorer.provable.com/v1 \
  --save /tmp \
  --yes \
  --fee-records "record1qvq..."
```

**获取私有 record**:
```bash
snarkos developer scan \
  --endpoint https://api.explorer.provable.com/v1 \
  --view-key YOUR_VIEW_KEY \
  --start START_HEIGHT \
  --end END_HEIGHT
```

### Step 5: 广播交易

如果使用 `--save` 参数，Leo 会生成交易文件但不广播。手动广播：

```bash
curl -X POST \
  https://api.explorer.provable.com/v1/testnet/transaction/broadcast \
  -H "Content-Type: application/json" \
  -d @/tmp/zk_invoice.aleo.deployment.json
```

**返回示例**:
```json
"at19wjr8krkxg33ykjmhunrufzrmk53n2r6qew9ynznu9mzldvmg5xqyayedc"
```

### Step 6: 验证部署

#### 检查交易状态

```bash
curl -s "https://api.explorer.provable.com/v1/testnet/transaction/TRANSACTION_ID" | jq '.status'
```

#### 检查程序是否部署成功

```bash
curl -s "https://api.explorer.provable.com/v1/testnet/program/zk_invoice.aleo" | head -50
```

如果返回程序代码（而不是 404），则部署成功！

---

## 前端集成指南

### 1. 安装 Aleo SDK

```bash
npm install @provablehq/sdk @demox-labs/aleo-wallet-adapter-react
```

### 2. 调用合约示例

#### 创建发票

```typescript
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';

const CreateInvoice = () => {
  const { requestRecords, requestTransaction } = useWallet();

  const createInvoice = async (
    buyer: string,
    amount: number,
    dueDate: number,
    invoiceHash: string,
    nonce: string
  ) => {
    const inputs = [
      buyer,                              // buyer address
      `${amount * 1_000_000}u64`,        // amount in microcredits
      `${dueDate}u32`,                    // due_date timestamp
      `${invoiceHash}field`,              // invoice_hash
      `${nonce}field`                     // nonce for uniqueness
    ];

    const result = await requestTransaction({
      program: 'zk_invoice.aleo',
      function: 'create_invoice',
      inputs: inputs,
      fee: 1.0  // fee in credits
    });

    return result; // Contains transaction ID and output records
  };
};
```

#### 支付发票（两步）

```typescript
const PayInvoice = () => {
  const { requestTransaction, publicKey } = useWallet();

  const payInvoice = async (
    invoiceRecord: string,
    sellerAddress: string,
    amount: number
  ) => {
    // Step 1: Transfer credits
    const paymentTx = await requestTransaction({
      program: 'credits.aleo',
      function: 'transfer_private',
      inputs: [
        creditsRecord,                    // Your credits record
        sellerAddress,                    // Seller address
        `${amount * 1_000_000}u64`       // Amount
      ],
      fee: 0.5
    });

    // Step 2: Mark as paid
    const paymentNonce = generateNonce(); // Generate random field
    const markPaidTx = await requestTransaction({
      program: 'zk_invoice.aleo',
      function: 'mark_as_paid',
      inputs: [
        invoiceRecord,                    // InvoiceRecord plaintext
        `${paymentNonce}field`            // Payment nonce
      ],
      fee: 0.5
    });

    return { paymentTx, markPaidTx };
  };
};
```

#### 查询 Records

```typescript
const FetchInvoices = () => {
  const { requestRecords } = useWallet();

  const getInvoices = async () => {
    const records = await requestRecords({
      program: 'zk_invoice.aleo'
    });

    // Filter by record type
    const invoices = records.filter(r =>
      r.recordName === 'InvoiceRecord'
    );

    const receipts = records.filter(r =>
      r.recordName === 'PaymentRecord'
    );

    return { invoices, receipts };
  };
};
```

### 3. 状态推导逻辑

由于合约是纯 record-based，前端需要根据 record 推导业务状态：

```typescript
interface Invoice {
  id: string;
  seller: string;
  buyer: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  role: 'SELLER' | 'BUYER';
}

const deriveInvoiceStatus = (
  invoiceRecords: InvoiceRecord[],
  paymentRecords: PaymentRecord[],
  currentAddress: string
): Invoice[] => {
  return invoiceRecords.map(invoice => {
    // Determine role
    const role = invoice.seller === currentAddress ? 'SELLER' : 'BUYER';

    // Determine status from record
    let status: string;
    switch (invoice.status) {
      case 0: status = 'PENDING'; break;
      case 1: status = 'PAID'; break;
      case 2: status = 'CANCELLED'; break;
      default: status = 'UNKNOWN';
    }

    // Additional verification with payment records
    const hasPayment = paymentRecords.some(p =>
      p.invoice_id === invoice.invoice_id
    );

    return {
      id: invoice.invoice_id,
      seller: invoice.seller,
      buyer: invoice.buyer,
      amount: invoice.amount / 1_000_000,  // Convert to credits
      status: hasPayment ? 'PAID' : status,
      role
    };
  });
};
```

---

## 关键经验与教训

### ✅ 成功经验

1. **使用纯 Record 架构绕过 testnet 限制**
   - 不使用 `async transition`
   - 不使用 `finalize` 函数
   - 不使用 `mapping` 存储

2. **避免 scalar 溢出**
   - ❌ 错误：`payment_nonce as scalar`
   - ✅ 正确：使用 struct + `BHP256::hash_to_field()`

3. **使用 struct 生成唯一 ID**
   ```leo
   let invoice_data: InvoiceData = InvoiceData { ... };
   let invoice_id: field = BHP256::hash_to_field(invoice_data);
   ```

4. **双份 Record 设计**
   - 一份给卖家（owner=seller）
   - 一份给买家（owner=buyer）
   - 确保双方都能独立管理和查询

### ⚠️ 遇到的问题

1. **Aleo Testnet 拒绝复杂合约**
   - **现象**: 包含 async/finalize 的合约广播后被 silent reject
   - **解决**: 简化为纯 record-based 架构

2. **Scalar 溢出 Panic**
   - **现象**: `Failed to eject scalar value: The scalar is greater than or equal to the modulus`
   - **原因**: `field` 值范围大于 `scalar`，强制转换导致溢出
   - **解决**: 使用 hash 函数而非 commit 函数

3. **费用不足**
   - **现象**: 部署失败，无错误提示
   - **解决**: 确保账户余额 > 部署费用 + 10 credits 缓冲

### 📈 复杂度对比

| 版本 | Variables | Constraints | 部署费用 | 部署状态 |
|-----|-----------|-------------|---------|---------|
| 完整版（async+finalize） | 374,693 | 301,779 | 21.5 credits | ❌ Rejected |
| 简化版（纯record） | 523,336 | 425,035 | 8.2 credits | ✅ Success |

**反直觉发现**: 简化版复杂度反而更高，因为：
- 增加了 `PaymentData` struct
- 增加了 `create_seller_receipt` function
- 使用更多的 hash 计算替代 mapping 查询

但仍然成功部署，证明 **testnet 限制的不是复杂度，而是 async/finalize 特性本身**。

---

## 故障排查

### 问题 1: 编译错误 - Program name mismatch

**错误信息**:
```
Error: The program name `xxx` must match `yyy` (specified in program.json)
```

**解决方案**:
确保 `src/main.leo` 中的 `program xxx.aleo` 与 `program.json` 中的 `"program"` 字段一致。

---

### 问题 2: 部署交易被拒绝

**症状**: 交易 pending 后变为 404，程序未部署

**可能原因**:
1. 使用了 `async transition` + `finalize`
2. 使用了 `mapping`
3. 余额不足

**解决方案**:
1. 简化合约，移除 async/finalize/mapping
2. 检查余额：`curl -s "API_ENDPOINT/program/credits.aleo/mapping/account/YOUR_ADDRESS"`
3. 等待 Aleo mainnet 或联系团队申请白名单

---

### 问题 3: Scalar 溢出

**错误信息**:
```
Failed to eject scalar value: The scalar is greater than or equal to the modulus
```

**解决方案**:
避免使用 `field as scalar`，改用 struct + hash：

```leo
// ❌ 错误
let id: field = BHP256::commit_to_field(invoice_id, nonce as scalar);

// ✅ 正确
struct PaymentData {
    invoice_id: field,
    payer: address,
    payee: address,
    payment_nonce: field
}
let payment_data: PaymentData = PaymentData { ... };
let id: field = BHP256::hash_to_field(payment_data);
```

---

### 问题 4: Record 无法解密

**症状**: 前端调用 `requestRecords` 返回空数组

**可能原因**:
1. View Key 不匹配
2. Record 尚未上链确认
3. 使用了错误的 program ID

**解决方案**:
1. 验证 View Key：检查 `.env` 文件
2. 等待交易确认（3-5 个区块）
3. 使用 `snarkos developer scan` 手动扫描
4. 检查 program ID 是否正确（区分大小写）

---

## 附录

### A. 部署费用估算

| 复杂度 | 预估费用 | 说明 |
|--------|---------|------|
| 极简程序 (<100 constraints) | 2-3 credits | Hello world 级别 |
| 简单程序 (1k-10k constraints) | 4-6 credits | 基础 token 合约 |
| 中等程序 (100k-500k constraints) | 8-12 credits | zk_invoice 级别 |
| 复杂程序 (>1M constraints) | 15-30 credits | 游戏/DeFi 协议 |

### B. Leo 语法速查

#### Constants
```leo
const STATUS_PENDING: u8 = 0u8;
```

#### Structs
```leo
struct Data {
    field1: address,
    field2: u64
}
```

#### Records
```leo
record MyRecord {
    owner: address,    // Required
    data: field
}
```

#### Transitions
```leo
transition my_function(input1: u64) -> u64 {
    return input1 + 1u64;
}
```

#### Hashing
```leo
// Hash to field
let hash: field = BHP256::hash_to_field(data);

// Commit (requires scalar, use carefully)
let commit: field = BHP256::commit_to_field(base, randomness as scalar);
```

### C. 有用的命令

```bash
# 查询程序
curl -s "https://api.explorer.provable.com/v1/testnet/program/PROGRAM_NAME.aleo"

# 查询交易
curl -s "https://api.explorer.provable.com/v1/testnet/transaction/TX_ID"

# 查询余额
curl -s "https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/ADDRESS"

# 扫描 records
snarkos developer scan \
  --endpoint https://api.explorer.provable.com/v1 \
  --view-key YOUR_VIEW_KEY \
  --start HEIGHT_START \
  --end HEIGHT_END

# 解密 record
snarkos developer decrypt \
  --ciphertext "record1qvq..." \
  --view-key YOUR_VIEW_KEY
```

---

## 联系与支持

- **Aleo Documentation**: https://developer.aleo.org/
- **Leo Language Guide**: https://developer.aleo.org/leo/
- **Aleo Discord**: https://discord.gg/aleo
- **Aleo Explorer**: https://explorer.aleo.org/

---

**部署完成时间**: 2026-01-09 01:45 UTC
**Testnet Version**: consensus-12
**Leo Version**: 3.4.0
**snarkOS Version**: 4.4.0

🎉 **Happy Building on Aleo!**
