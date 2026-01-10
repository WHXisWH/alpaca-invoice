# zk_invoice.aleo 完整测试指南

这份指南提供了详细的测试步骤和示例，帮助你全面测试 zk_invoice.aleo 合约的所有功能。

## 目录
1. [环境准备](#环境准备)
2. [基础功能测试](#基础功能测试)
3. [完整工作流测试](#完整工作流测试)
4. [边界条件测试](#边界条件测试)
5. [负面测试（错误情况）](#负面测试)
6. [安全性测试](#安全性测试)

---

## 环境准备

### 1. 安装 Leo CLI
```bash
# 安装 Leo (如果还没有安装)
curl -L https://raw.githubusercontent.com/AleoHQ/leo/testnet3/install.sh | sh

# 验证安装
leo --version
```

### 2. 创建测试账户
```bash
# 创建卖家账户
leo account new
# 保存输出的 Private Key 和 Address

# 创建买家账户
leo account new
# 保存输出的 Private Key 和 Address
```

### 3. 构建项目
```bash
cd /Users/moose_ou/Alapaca-Inovice
leo build
```

---

## 基础功能测试

### 测试 1: create_invoice (创建发票)

#### 测试用例 1.1: 正常创建发票
```bash
leo run create_invoice \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc \
  1000000u64 \
  1735689600u32 \
  123456789field \
  99999field
```

**预期结果:**
- ✓ 返回两个 InvoiceRecord（seller_record 和 buyer_record）
- ✓ 两个 record 有相同的 invoice_id
- ✓ seller_record.owner 是调用者（卖家）
- ✓ buyer_record.owner 是买家地址
- ✓ status 都是 0u8 (PENDING)

#### 测试用例 1.2: 最小金额
```bash
leo run create_invoice \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc \
  1u64 \
  1735689600u32 \
  123456789field \
  11111field
```

**预期结果:**
- ✓ 成功创建金额为 1u64 的发票

#### 测试用例 1.3: 最大金额
```bash
leo run create_invoice \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc \
  18446744073709551615u64 \
  1735689600u32 \
  123456789field \
  22222field
```

**预期结果:**
- ✓ 成功创建金额为 u64::MAX 的发票

---

### 测试 2: verify_invoice (验证发票)

**前置条件:** 需要先创建一个发票

#### 测试用例 2.1: 正确的哈希验证
```bash
# 步骤 1: 创建发票并保存输出
leo run create_invoice \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc \
  1000000u64 \
  1735689600u32 \
  123456789field \
  99999field

# 步骤 2: 从输出中复制 seller_record，然后验证
leo run verify_invoice "{seller_record}" 123456789field
```

**预期结果:**
- ✓ 返回 true

#### 测试用例 2.2: 错误的哈希验证
```bash
# 使用上面的 seller_record，但用错误的哈希
leo run verify_invoice "{seller_record}" 987654321field
```

**预期结果:**
- ✓ 返回 false

---

### 测试 3: mark_as_paid (标记为已支付)

**前置条件:** 需要买家的发票 record

#### 测试用例 3.1: 买家标记支付
```bash
# 步骤 1: 创建发票（从买家的视角）
# 使用买家的 private key 切换账户
leo run create_invoice \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc \
  1000000u64 \
  1735689600u32 \
  123456789field \
  99999field

# 步骤 2: 买家标记为已支付（复制 buyer_record）
leo run mark_as_paid "{buyer_record}" 88888field
```

**预期结果:**
- ✓ 返回 PaymentRecord（收据）
- ✓ 返回更新的 InvoiceRecord（status = 1u8）
- ✓ PaymentRecord.payer 是买家
- ✓ PaymentRecord.payee 是卖家
- ✓ PaymentRecord.amount 匹配发票金额

---

### 测试 4: create_seller_receipt (创建卖家收据)

#### 测试用例 4.1: 卖家创建收据
```bash
# 使用卖家账户
leo run create_seller_receipt \
  1234567890field \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc \
  1000000u64 \
  88888field
```

**预期结果:**
- ✓ 返回 PaymentRecord
- ✓ PaymentRecord.owner 是卖家
- ✓ 参数匹配买家的收据参数时，payment_id 应该相同

---

### 测试 5: cancel_invoice (取消发票)

**前置条件:** 需要 PENDING 状态的发票 record

#### 测试用例 5.1: 卖家取消发票
```bash
# 步骤 1: 创建发票
leo run create_invoice \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc \
  1000000u64 \
  1735689600u32 \
  123456789field \
  99999field

# 步骤 2: 卖家取消发票（复制 seller_record）
leo run cancel_invoice "{seller_record}"
```

**预期结果:**
- ✓ 返回 InvoiceRecord
- ✓ status 变为 2u8 (CANCELLED)
- ✓ 其他字段保持不变

---

### 测试 6: verify_payment (验证支付)

**前置条件:** 需要 PaymentRecord 和 InvoiceRecord

#### 测试用例 6.1: 匹配的支付验证
```bash
# 步骤 1: 创建发票并标记为已支付
# （参考测试 3）

# 步骤 2: 验证支付
leo run verify_payment "{payment_record}" "{invoice_record}"
```

**预期结果:**
- ✓ 返回 true（当所有字段匹配时）

---

## 完整工作流测试

### 场景: 从创建到支付的完整流程

```bash
# ===== 步骤 1: 卖家创建发票 =====
echo "Step 1: Seller creates invoice"
leo run create_invoice \
  aleo1buyer_address_here \
  1000000u64 \
  1735689600u32 \
  123456789field \
  99999field

# 保存 seller_record 和 buyer_record

# ===== 步骤 2: 买家验证发票哈希 =====
echo "Step 2: Buyer verifies invoice hash"
leo run verify_invoice "{buyer_record}" 123456789field
# 预期: true

# ===== 步骤 3: 买家通过 credits.aleo 转账 =====
echo "Step 3: Buyer sends payment (via credits.aleo)"
# 注: 这一步在实际使用中需要调用 credits.aleo/transfer_private
# leo run credits.aleo/transfer_private {amount} {seller_address}

# ===== 步骤 4: 买家标记发票为已支付 =====
echo "Step 4: Buyer marks invoice as paid"
leo run mark_as_paid "{buyer_record}" 88888field
# 保存 buyer_payment_record 和 updated_invoice

# ===== 步骤 5: 卖家创建自己的收据 =====
echo "Step 5: Seller creates receipt"
leo run create_seller_receipt \
  {invoice_id}field \
  aleo1buyer_address_here \
  aleo1seller_address_here \
  1000000u64 \
  88888field
# 保存 seller_payment_record

# ===== 步骤 6: 验证支付 =====
echo "Step 6: Verify payment"
leo run verify_payment "{buyer_payment_record}" "{updated_invoice}"
# 预期: true

# ===== 步骤 7: 验证买卖双方的 payment_id 一致 =====
echo "Step 7: Verify payment IDs match"
# 手动比较 buyer_payment_record.payment_id 和 seller_payment_record.payment_id
# 预期: 两者相同
```

**预期完整流程结果:**
- ✓ 发票成功创建
- ✓ 哈希验证通过
- ✓ 支付标记成功
- ✓ 双方收据的 payment_id 一致
- ✓ 支付验证通过

---

## 边界条件测试

### 测试 7: 边界值测试

#### 7.1 金额边界
```bash
# 最小值
leo run create_invoice buyer_addr 1u64 1735689600u32 123456789field 1field

# 最大值
leo run create_invoice buyer_addr 18446744073709551615u64 1735689600u32 123456789field 2field
```

#### 7.2 时间戳边界
```bash
# 最小时间戳
leo run create_invoice buyer_addr 1000000u64 0u32 123456789field 3field

# 最大时间戳
leo run create_invoice buyer_addr 1000000u64 4294967295u32 123456789field 4field
```

#### 7.3 不同的 nonce 值
```bash
# 测试 nonce 对 invoice_id 的影响
leo run create_invoice buyer_addr 1000000u64 1735689600u32 123456789field 1field
leo run create_invoice buyer_addr 1000000u64 1735689600u32 123456789field 2field
# 验证两个发票的 invoice_id 不同
```

---

## 负面测试

这些测试应该**失败**（被合约拒绝）：

### 测试 8: 错误输入测试

#### 8.1 卖家和买家相同（应失败）
```bash
# 使用相同的地址作为买家
leo run create_invoice \
  {same_as_caller_address} \
  1000000u64 \
  1735689600u32 \
  123456789field \
  99999field
```
**预期结果:** ❌ 失败 (assert_neq 触发)

#### 8.2 金额为零（应失败）
```bash
leo run create_invoice \
  buyer_addr \
  0u64 \
  1735689600u32 \
  123456789field \
  99999field
```
**预期结果:** ❌ 失败 (assert amount > 0 触发)

#### 8.3 非买家标记支付（应失败）
```bash
# 使用卖家账户标记买家的发票为已支付
leo run mark_as_paid "{buyer_record}" 88888field
```
**预期结果:** ❌ 失败 (assert_eq caller == buyer 触发)

#### 8.4 标记已支付的发票（应失败）
```bash
# 对 status = 1u8 的发票再次标记
leo run mark_as_paid "{already_paid_invoice}" 88888field
```
**预期结果:** ❌ 失败 (assert_eq status == PENDING 触发)

#### 8.5 非卖家取消发票（应失败）
```bash
# 使用买家账户取消发票
leo run cancel_invoice "{seller_record}"
```
**预期结果:** ❌ 失败 (assert_eq caller == seller 触发)

#### 8.6 取消已支付的发票（应失败）
```bash
# 对 status = 1u8 的发票取消
leo run cancel_invoice "{paid_invoice_record}"
```
**预期结果:** ❌ 失败 (assert_eq status == PENDING 触发)

#### 8.7 非收款人创建收据（应失败）
```bash
# 使用非 payee 的账户创建收据
leo run create_seller_receipt \
  invoice_id \
  buyer_addr \
  different_seller_addr \
  1000000u64 \
  88888field
```
**预期结果:** ❌ 失败 (assert_eq caller == payee 触发)

---

## 安全性测试

### 测试 9: 哈希一致性测试

验证相同输入产生相同的 ID：

```bash
# 创建两个参数完全相同的发票
leo run create_invoice buyer_addr 1000000u64 1735689600u32 123456789field 99999field
# 记录 invoice_id_1

leo run create_invoice buyer_addr 1000000u64 1735689600u32 123456789field 99999field
# 记录 invoice_id_2

# 手动比较 invoice_id_1 和 invoice_id_2
```
**预期结果:** ✓ 两个 invoice_id 应该完全相同

### 测试 10: Payment ID 一致性测试

验证买家和卖家使用相同参数时 payment_id 一致：

```bash
# 买家标记支付
leo run mark_as_paid "{buyer_invoice}" 88888field
# 记录 buyer_payment_id

# 卖家创建收据（使用相同参数）
leo run create_seller_receipt \
  {same_invoice_id} \
  {same_buyer} \
  {same_seller} \
  {same_amount} \
  88888field  # 相同的 payment_nonce
# 记录 seller_payment_id

# 比较两个 payment_id
```
**预期结果:** ✓ buyer_payment_id == seller_payment_id

### 测试 11: Record 不可重用测试

```bash
# 步骤 1: 创建并使用一个 record
leo run create_invoice buyer_addr 1000000u64 1735689600u32 123456789field 99999field
# 保存 seller_record

# 步骤 2: 取消这个发票
leo run cancel_invoice "{seller_record}"

# 步骤 3: 尝试再次使用相同的 seller_record
leo run cancel_invoice "{seller_record}"
```
**预期结果:** ❌ 第二次取消应该失败（record 已被消耗）

---

## 测试检查清单

使用这个清单确保所有测试都已完成：

### 功能测试
- [ ] create_invoice - 正常创建
- [ ] create_invoice - 最小金额
- [ ] create_invoice - 最大金额
- [ ] create_invoice - 不同 nonce
- [ ] verify_invoice - 匹配哈希
- [ ] verify_invoice - 不匹配哈希
- [ ] mark_as_paid - 正常支付
- [ ] create_seller_receipt - 正常创建
- [ ] cancel_invoice - 正常取消
- [ ] verify_payment - 匹配验证
- [ ] verify_payment - 不匹配验证

### 工作流测试
- [ ] 完整的创建到支付流程
- [ ] payment_id 一致性验证
- [ ] 多发票并行管理

### 负面测试
- [ ] 卖家买家相同（应失败）
- [ ] 金额为零（应失败）
- [ ] 非买家标记支付（应失败）
- [ ] 重复标记支付（应失败）
- [ ] 非卖家取消（应失败）
- [ ] 取消已支付发票（应失败）
- [ ] 非收款人创建收据（应失败）

### 安全性测试
- [ ] 哈希碰撞测试
- [ ] Record 重用测试
- [ ] Payment ID 一致性

---

## 测试数据参考

### 常用测试地址
```
卖家 (Seller): aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc
买家 (Buyer):  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc
其他买家:      aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqj3hg5c
```

### 常用测试值
```
金额:
- 小额: 1u64
- 标准: 1000000u64 (1 ALEO)
- 大额: 1000000000000u64 (1M ALEO)
- 最大: 18446744073709551615u64

时间戳:
- 2025-01-01: 1735689600u32
- 2025-01-02: 1735776000u32
- 2025-01-03: 1735862400u32

哈希:
- 标准: 123456789field
- 备选: 987654321field

Nonce:
- 序列: 1field, 2field, 3field, ...
- 标准: 99999field
- 支付: 88888field
```

---

## 故障排除

### 常见问题

**Q: 测试失败提示 "record not found"**
A: 确保使用正确的 record，每个 record 只能使用一次。

**Q: 地址验证失败**
A: 确保使用正确格式的 Aleo 地址（以 aleo1 开头）。

**Q: "assert_eq failed" 错误**
A: 这是正常的安全验证，检查是否满足函数的前置条件。

**Q: 如何保存 record？**
A: 将 leo run 的输出复制到文本文件，或使用 `leo record` 命令管理。

---

## 进一步测试

完成基础测试后，考虑：

1. **性能测试**: 批量创建大量发票
2. **压力测试**: 使用极端参数值
3. **并发测试**: 同时处理多个发票
4. **集成测试**: 与 credits.aleo 集成
5. **用户体验测试**: 实际场景模拟

---

## 报告问题

如果发现任何问题，请记录：
1. 测试步骤
2. 预期结果
3. 实际结果
4. 错误消息
5. 环境信息（Leo 版本等）

提交 issue 到项目仓库。
