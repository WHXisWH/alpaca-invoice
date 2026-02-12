# CryptoService 测试文档

## 概述

本测试套件为 `CryptoService` 提供全面的单元测试覆盖，确保以下功能的正确性：

- 🔐 **加密/解密**：发票明细的本地加密存储（PBKDF2 + AES-GCM）
- 🔑 **哈希计算**：发票哈希计算（SHA-256 + 模运算）
- ✅ **完整性验证**：防篡改验证机制（链上哈希 vs 本地哈希）
- 📦 **Record 解析**：解析钱包已解密的 Aleo Record 数据
- 🛡️ **Field 验证**：验证 Aleo Field 值的有效性

测试覆盖了从发票创建到验证的完整生命周期，确保数据安全和完整性。

## 测试结构

### 1. computeInvoiceHash 测试

测试发票哈希计算功能：

- ✅ **一致性测试**：相同输入应生成相同哈希
- ✅ **唯一性测试**：不同输入应生成不同哈希
- ✅ **格式验证**：输出应符合 `AleoField` 格式（`\d+field`）
- ✅ **排序不敏感性**：字段顺序不应影响哈希值
- ✅ **多项目处理**：正确处理包含多个行项目的发票
- ✅ **可选字段处理**：正确处理有/无可选字段的情况

**重要说明**：
- 使用 Web Crypto API 的 SHA-256 算法生成哈希
- 通过模运算确保哈希值在 Aleo Field 的有效范围内
- 使用排序后的 JSON 字符串确保字段顺序不影响哈希值

### 2. encryptInvoiceDetails 测试

测试发票明细加密功能：

- ✅ **基本加密**：成功加密并返回 `iv` 和 `ciphertext`
- ✅ **随机性**：相同输入应生成不同的密文（因为 IV 随机）
- ✅ **密钥长度处理**：正确处理不同长度的密钥
- ✅ **错误处理**：加密失败时抛出 `CryptoServiceError`

**加密机制**：
- 使用 AES-GCM 加密算法
- 随机生成 12 字节 IV（初始化向量）
- 密钥自动派生为 32 字节（AES-256）
- 结果使用 Base64 编码

### 3. decryptInvoiceDetails 测试

测试发票明细解密功能：

- ✅ **正确解密**：能够解密之前加密的数据
- ✅ **复杂数据处理**：处理包含多个项目和特殊字符的发票
- ✅ **错误密钥检测**：使用错误密钥时抛出 `DECRYPTION_FAILED`
- ✅ **数据完整性**：检测损坏的密文
- ✅ **空值处理**：处理空 IV 或密文的情况

### 4. parseAleoRecord 测试

测试 Aleo Record 数据解析功能：

- ✅ **处理已解密数据**：解析来自 `wallet.requestRecords()` 的已解密 JSON 数据
- ✅ **泛型类型支持**：支持泛型类型推断，可解析不同类型的 Record
- ✅ **批量数据支持**：支持 JSON 数组格式（多个 Record）
- ✅ **record1 格式提示**：对加密的 record1 格式提示使用 `wallet.requestRecords()`
- ✅ **未知格式处理**：对未知格式抛出清晰的错误提示
- ✅ **边界情况**：处理无效 JSON 和空字符串

**实际使用场景说明**：
- 🔑 **不需要手动管理 ViewKey**：钱包适配器会自动使用内部 ViewKey 解密
- 📦 **数据来源**：此方法处理的是 `wallet.requestRecords()` 返回的已解密数据
- 🚫 **不直接解密**：不应该传入加密的 `record1...` 格式
- ✅ **推荐做法**：使用 `wallet.requestRecords(programId)` 获取已解密的 Record

**示例用法**：
```typescript
// ✅ 正确：使用 wallet.requestRecords() 获取已解密数据
const records = await wallet.requestRecords('zk_invoice_v2.aleo');
for (const record of records.records) {
  // record.data 已经是解密后的 JSON 字符串
  const parsed = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
    JSON.stringify(record.data)
  );
  // 现在可以使用 parsed.invoice_hash 等字段
}

// ❌ 错误：不要直接传入加密的 record1 格式
const encrypted = 'record1qvq...'; // 这是加密的
await cryptoService.parseAleoRecord(encrypted); // 会抛出错误并提示使用 wallet.requestRecords()
```

### 5. verifyInvoiceIntegrity 测试（防篡改验证）

测试发票完整性验证功能，这是发票系统的核心安全功能：

- ✅ **有效数据验证**：验证未被篡改的发票数据为有效
- ✅ **篡改检测**：检测到被篡改的发票数据（修改金额）
- ✅ **部分字段篡改检测**：检测到部分字段被篡改的情况（如修改备注）
- ✅ **字段顺序不敏感性**：验证对字段顺序不敏感（JSON 规范化）
- ✅ **错误处理**：处理验证过程中的错误

**验证机制**：
- 链上存储 `invoice_hash`（不可篡改）
- 本地存储加密的发票明细
- 查看时通过重新计算哈希验证数据完整性
- 如果本地数据被篡改，哈希不匹配，系统拒绝显示

**使用场景**：
```typescript
// 1. 从链上获取 invoice_hash
const chainRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
  JSON.stringify(record.data)
);
const chainInvoiceHash = chainRecord.invoice_hash;

// 2. 从 IndexedDB 解密本地明细
const encryptedPayload = await storageService.getEncryptedInvoice(invoiceHash);
const localDetails = await cryptoService.decryptInvoiceDetails(encryptedPayload, masterKey);

// 3. 验证完整性
const isValid = await cryptoService.verifyInvoiceIntegrity(localDetails, chainInvoiceHash);
if (!isValid) {
  throw new Error('发票数据已被篡改！');
}
```

### 6. 完整的发票验证流程（集成测试）

测试真实的发票生命周期完整流程：

- ✅ **端到端流程**：开票 → 计算哈希 → 存入链上 → 本地加密存储 → 解析链上 Record → 解密本地明细 → 验证完整性
- ✅ **篡改检测**：检测到本地数据被篡改的情况
- ✅ **密钥错误处理**：处理密钥错误的情况

**完整流程示例**：
```typescript
// 阶段 1: 开票
const invoiceHash = await service.computeInvoiceHash(invoiceDetails);

// 阶段 2: 本地加密存储
const encryptedPayload = await service.encryptInvoiceDetails(invoiceDetails, masterKey);
// 存入 IndexedDB: await storageService.saveEncryptedInvoice(invoiceHash, encryptedPayload);

// 阶段 3: 模拟链上 Record（钱包已解密）
const chainRecord = await service.parseAleoRecord<AleoInvoiceRecord>(jsonString);

// 阶段 4: 解密本地明细并验证
const decryptedDetails = await service.decryptInvoiceDetails(encryptedPayload, masterKey);
const isValid = await service.verifyInvoiceIntegrity(decryptedDetails, chainRecord.invoice_hash);
```

### 7. Field 验证测试

测试 Aleo Field 值的验证功能：

- ✅ **有效值验证**：验证有效的 Field 值
- ✅ **范围检查**：拒绝超出范围的 Field 值（超过模数）
- ✅ **负数检查**：拒绝负数 Field 值
- ✅ **格式检查**：拒绝格式错误的 Field 值
- ✅ **哈希生成验证**：确保 `computeInvoiceHash` 生成的哈希始终在有效范围内

**Field 范围**：
- Aleo Field 模数：`8444461749428370424248824938781546531375899335154063827935233455917409239041`
- 所有 Field 值必须在此范围内
- `computeInvoiceHash` 通过模运算确保结果在有效范围内

### 8. deriveMasterKey 测试

测试从签名派生主密钥功能：

- ✅ **基本功能**：成功从签名派生主密钥
- ✅ **确定性**：相同签名产生相同主密钥
- ✅ **唯一性**：不同签名产生不同主密钥
- ✅ **错误处理**：签名为空时抛出错误
- ✅ **格式支持**：正确处理各种签名格式（特殊字符、Unicode、长签名等）
- ✅ **格式验证**：主密钥是有效的十六进制字符串（64 个字符）
- ✅ **错误类型**：抛出 `CryptoServiceError` 类型的错误

**使用场景**：
- 用户首次创建发票时，需要授权访问私有发票数据
- 通过签名消息获取签名，然后从此签名派生主密钥
- 主密钥用于加密/解密存储在 IndexedDB 中的发票明细

**实现说明**：
- 使用 SHA-256 对签名进行哈希
- 将哈希结果转换为十六进制字符串
- 返回该字符串作为 masterKey（后续会使用 PBKDF2 进一步派生加密密钥）

**安全性**：
- 签名是用户钱包私钥对特定消息的签名，具有唯一性和不可伪造性
- 使用 SHA-256 确保密钥的随机性和安全性
- 相同的签名总是产生相同的主密钥（确定性派生）

### 9. 错误处理测试

测试错误类型和错误处理机制：

- ✅ **错误类型**：验证 `CryptoServiceError` 的正确创建
- ✅ **错误代码**：验证错误码的正确性
- ✅ **错误方法**：测试 `is()` 和 `isOneOf()` 方法

## 运行测试

```bash
# 运行所有测试
npm test

# 运行 CryptoService 测试
npm test -- CryptoService

# 监视模式（开发时使用）
npm test -- --watch

# 生成覆盖率报告
npm test -- --coverage
```

## 测试覆盖率目标

- **行覆盖率**: > 90%
- **分支覆盖率**: > 85%
- **函数覆盖率**: 100%

## 已知限制

### 1. 哈希算法

**当前实现**：`computeInvoiceHash` 使用 Web Crypto API 的 SHA-256 + 模运算

**说明**：
- 使用标准的 SHA-256 算法生成 256 位哈希
- 通过模运算确保哈希值在 Aleo Field 的有效范围内
- 符合合约 `BHP256::hash_to_field` 的要求

**技术细节**：
- SHA-256 哈希值可能大于 Aleo Field 模数
- 通过 `hash % ALEO_FIELD_MODULUS` 映射到有效范围
- 使用排序后的 JSON 字符串确保字段顺序不影响哈希值

**未来优化**（可选）：
```typescript
// 如果 Aleo SDK 提供更直接的 hash_to_field 方法，可以考虑使用
// import { hash_to_field } from '@aleo/sdk';
// 但当前实现已经满足合约要求
```

### 2. Aleo Record 数据处理

**设计理念**：不需要手动管理 ViewKey 和加密解密

**实际使用方式**：
- ✅ 使用 `wallet.requestRecords(programId)` 获取已解密的 Record
- ✅ 钱包适配器自动使用内部 ViewKey 解密
- ✅ `parseAleoRecord` 用于处理已解密的 JSON 数据

**当前实现**：
```typescript
// 处理已解密的 JSON 数据
const records = await wallet.requestRecords('zk_invoice_v2.aleo');
const parsed = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
  JSON.stringify(records[0].data)
);
```

**为什么不直接解密 record1 格式？**
1. ViewKey 由钱包管理，前端不应该直接访问
2. `wallet.requestRecords()` 已经提供了解密功能
3. 避免重复实现和安全风险
4. 保持与钱包适配器的架构一致性
5. 符合隐私保护最佳实践

## 测试数据

### 测试用发票示例

```typescript
const sampleInvoice: InvoiceDetails = {
  invoiceNumber: 'INV-001',
  lineItems: [
    { description: 'Product A', quantity: 2, unitPrice: 100, amount: 200 }
  ],
  subtotal: 200,
  taxRate: 0.1,
  taxAmount: 20,
  total: 220,
  currency: 'USD',
  notes: 'Test invoice'
};
```

### 测试用密钥

- 短密钥: `'short'`
- 标准密钥: `'test-master-key-12345678901234567890'` (32+ 字符)
- 长密钥: `'this-is-a-very-long-master-key-with-many-characters-that-exceeds-32-bytes'`

## 相关文件

- **接口定义**: `../ICryptoService.ts`
- **实现文件**: `../CryptoServiceImpl.ts`
- **类型定义**: `@/lib/types.ts`
- **加密工具**: `@/lib/crypto.ts`
- **错误基类**: `@/lib/service-errors.ts`

## 参考资料

- [Aleo Architecture Documentation](../../../docs/ARCHITECTURE_NEW.md)
- [Service Error Handling](../../../docs/ARCHITECTURE_NEW.md#错误处理系统)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM Encryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)

## 贡献指南

添加新测试时，请遵循以下规范：

1. **测试命名**：使用清晰的中文描述
2. **AAA 模式**：Arrange（准备）、Act（执行）、Assert（断言）
3. **独立性**：每个测试应该独立运行
4. **覆盖率**：确保覆盖正常流程和异常情况

## 维护记录

- **创建日期**: 2026-01
- **最后更新**: 2026-01-13
- **更新内容**:
  - 添加 `verifyInvoiceIntegrity` 测试说明
  - 添加完整的发票验证流程（集成测试）说明
  - 添加 Field 验证测试说明
  - 更新 `parseAleoRecord` 测试说明（从 `decryptAleoRecord` 更名）
  - 更新哈希算法说明（反映实际 SHA-256 + 模运算实现）
- **维护者**: Aleo Privacy Invoice System Team
