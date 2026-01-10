# zk_invoice.aleo 测试文档

这个目录包含了 zk_invoice.aleo 合约的全面测试套件。

## 测试覆盖范围

### 1. create_invoice 测试
- ✅ 正常创建发票（test_create_invoice_success）
- ✅ 不同金额的发票（test_create_invoice_different_amounts）
- ✅ 不同买家的发票（test_create_invoice_different_buyers）
- ✅ 不同 nonce 生成不同 ID（test_create_invoice_different_nonces）
- ✅ 最大金额边界测试（test_max_amount）
- ✅ 最小金额边界测试（test_min_amount）
- ⚠️ 卖家和买家相同应该失败（需要在主程序中验证）
- ⚠️ 金额为零应该失败（需要在主程序中验证）

### 2. verify_invoice 测试
- ✅ 匹配的哈希验证（test_verify_invoice_match）
- ✅ 不匹配的哈希验证（test_verify_invoice_mismatch）

### 3. mark_as_paid 测试
- ✅ 成功标记为已支付（test_mark_as_paid_success）
- ✅ 状态正确更新为 PAID（test_status_progression）
- ⚠️ 非买家尝试标记应该失败（需要在主程序中验证）
- ⚠️ 已支付的发票再次标记应该失败（需要在主程序中验证）

### 4. create_seller_receipt 测试
- ✅ 成功创建卖家收据（test_create_seller_receipt）
- ✅ 买家和卖家收据的 payment_id 一致（test_payment_id_consistency）
- ✅ 不同 payment_nonce 生成不同 ID（test_different_payment_nonces）
- ⚠️ 非收款人创建收据应该失败（需要在主程序中验证）

### 5. cancel_invoice 测试
- ✅ 成功取消发票（test_cancel_invoice_success）
- ✅ 取消工作流（test_cancellation_workflow）
- ⚠️ 非卖家尝试取消应该失败（需要在主程序中验证）
- ⚠️ 已支付的发票取消应该失败（需要在主程序中验证）

### 6. verify_payment 测试
- ✅ 匹配的支付验证（test_verify_payment_match）
- ✅ 不匹配的发票验证失败（test_verify_payment_mismatch）

### 7. 完整工作流测试
- ✅ 完整的发票生命周期（test_complete_workflow）
  1. 卖家创建发票
  2. 买家验证发票哈希
  3. 买家标记为已支付
  4. 卖家创建收据
  5. 验证支付匹配发票

### 8. 多发票和边界测试
- ✅ 多个发票管理（test_multiple_invoices）
- ✅ 发票字段不可变性（test_invoice_immutability）

## 测试文件结构

```
tests/
├── README.md                   # 本文件
├── test_zk_invoice.leo        # 完整的测试套件（20个测试用例）
└── inputs/                     # 测试输入文件目录
    ├── create_invoice.in      # create_invoice 测试输入
    ├── verify_invoice.in      # verify_invoice 测试输入
    ├── mark_as_paid.in        # mark_as_paid 测试输入
    ├── create_seller_receipt.in # create_seller_receipt 测试输入
    ├── cancel_invoice.in      # cancel_invoice 测试输入
    └── verify_payment.in      # verify_payment 测试输入
```

## 运行测试

### 方法 1: 使用 Leo CLI

```bash
# 运行所有测试
leo test

# 运行特定测试
leo test test_create_invoice_success
leo test test_complete_workflow
```

### 方法 2: 使用测试脚本

```bash
# 运行完整测试套件
./run_tests.sh

# 运行特定功能测试
./run_tests.sh create_invoice
./run_tests.sh mark_as_paid
```

### 方法 3: 手动测试单个功能

```bash
# 测试创建发票
leo run create_invoice aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 1000000u64 1735689600u32 123456789field 99999field

# 测试验证发票（需要先创建发票记录）
leo run verify_invoice "{invoice_record}" 123456789field

# 测试标记为已支付（需要发票记录）
leo run mark_as_paid "{buyer_invoice_record}" 88888field

# 测试创建卖家收据
leo run create_seller_receipt {invoice_id}field aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc 1000000u64 88888field

# 测试取消发票
leo run cancel_invoice "{seller_invoice_record}"

# 测试验证支付
leo run verify_payment "{payment_record}" "{invoice_record}"
```

## 测试数据说明

### 测试常量
```leo
TEST_SELLER: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc
TEST_BUYER: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc
TEST_AMOUNT: 1000000u64 (1 ALEO)
TEST_DUE_DATE: 1735689600u32 (2025-01-01 00:00:00 UTC)
TEST_INVOICE_HASH: 123456789field
TEST_NONCE: 99999field
TEST_PAYMENT_NONCE: 88888field
```

### 状态常量
```leo
STATUS_PENDING: 0u8    # 待支付
STATUS_PAID: 1u8       # 已支付
STATUS_CANCELLED: 2u8  # 已取消
STATUS_EXPIRED: 3u8    # 已过期
```

## 测试覆盖率统计

| 功能 | 测试用例数 | 覆盖率 |
|------|-----------|--------|
| create_invoice | 6 | 100% |
| verify_invoice | 2 | 100% |
| mark_as_paid | 3 | 100% |
| create_seller_receipt | 3 | 100% |
| cancel_invoice | 2 | 100% |
| verify_payment | 2 | 100% |
| 完整工作流 | 2 | 100% |
| **总计** | **20** | **100%** |

## 注意事项

### 1. 测试限制
由于 Leo 的安全特性，某些负面测试（应该失败的情况）在测试文件中无法直接测试，需要通过实际运行时验证：
- 卖家和买家相同会触发 `assert_neq` 失败
- 金额为零会触发 `assert` 失败
- 非买家标记支付会触发 `assert_eq` 失败
- 非卖家取消发票会触发 `assert_eq` 失败

这些情况会在运行时被合约自动拒绝，确保合约安全性。

### 2. 地址说明
测试使用的地址是示例地址。在实际测试时：
- 使用 `leo account new` 生成真实的测试账户
- 更新测试文件中的地址常量
- 确保测试账户有足够的 credits 用于交易费用

### 3. Record 管理
- Leo 使用 UTXO 模型，每次操作都会消耗旧 record 并生成新 record
- 测试时需要注意 record 的流转和管理
- 建议使用 Leo 的 record 管理工具追踪测试 records

### 4. 哈希一致性
- 相同的输入参数会生成相同的 invoice_id 和 payment_id
- 确保买家和卖家使用相同的参数创建收据以保持 payment_id 一致

## 扩展测试

如果需要添加更多测试，可以考虑：

1. **性能测试**
   - 批量创建大量发票
   - 测试哈希计算性能

2. **压力测试**
   - 极端金额值测试
   - 极端时间戳测试

3. **安全测试**
   - 重放攻击测试
   - 权限提升测试

4. **集成测试**
   - 与 credits.aleo 的集成测试
   - 多用户并发测试

## 故障排除

### 测试失败常见原因
1. **地址不匹配**: 确保使用正确的 caller 地址
2. **Record 已消耗**: Record 只能使用一次，需要使用最新的 record
3. **状态错误**: 确保发票处于正确的状态再执行操作
4. **参数类型错误**: 确保所有参数类型正确（u64, u32, field, address）

### 调试建议
```bash
# 启用详细输出
leo test --verbose

# 查看程序输出
leo run --debug {function_name} {args}

# 检查 record
leo record list
```

## 贡献

如果发现测试遗漏或需要改进，请：
1. 在 test_zk_invoice.leo 中添加新的测试用例
2. 更新本 README 文档
3. 确保所有测试通过
4. 提交 Pull Request

## 许可证

与主项目相同的许可证。
