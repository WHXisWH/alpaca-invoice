# 测试快速参考

这是一个快速参考指南，列出所有测试命令。详细说明请参考 [TESTING_GUIDE.md](TESTING_GUIDE.md)。

## 🚀 快速开始

```bash
# 1. 构建项目
leo build

# 2. 运行自动化测试
./run_tests.sh

# 3. 运行特定功能测试
./run_tests.sh create_invoice
```

## 📝 基础测试命令

### create_invoice
```bash
# 正常创建
leo run create_invoice aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 1000000u64 1735689600u32 123456789field 99999field

# 最小金额
leo run create_invoice aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 1u64 1735689600u32 123456789field 11111field

# 最大金额
leo run create_invoice aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 18446744073709551615u64 1735689600u32 123456789field 22222field
```

### verify_invoice
```bash
# 匹配哈希（需要先创建发票）
leo run verify_invoice "{invoice_record}" 123456789field

# 不匹配哈希
leo run verify_invoice "{invoice_record}" 987654321field
```

### mark_as_paid
```bash
# 买家标记支付（需要买家的发票 record）
leo run mark_as_paid "{buyer_invoice_record}" 88888field
```

### create_seller_receipt
```bash
# 卖家创建收据
leo run create_seller_receipt 1234567890field aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc 1000000u64 88888field
```

### cancel_invoice
```bash
# 卖家取消发票（需要卖家的发票 record）
leo run cancel_invoice "{seller_invoice_record}"
```

### verify_payment
```bash
# 验证支付（需要支付 record 和发票 record）
leo run verify_payment "{payment_record}" "{invoice_record}"
```

## 🔄 完整工作流

```bash
# 1. 创建发票
leo run create_invoice buyer_addr 1000000u64 1735689600u32 123456789field 99999field
# 保存: seller_record, buyer_record

# 2. 验证发票
leo run verify_invoice "{buyer_record}" 123456789field

# 3. 标记支付
leo run mark_as_paid "{buyer_record}" 88888field
# 保存: payment_record, updated_invoice

# 4. 创建卖家收据
leo run create_seller_receipt {invoice_id} buyer_addr seller_addr 1000000u64 88888field
# 保存: seller_receipt

# 5. 验证支付
leo run verify_payment "{payment_record}" "{updated_invoice}"
```

## ✅ 应该成功的测试

| 测试 | 命令 | 预期 |
|------|------|------|
| 创建正常发票 | `leo run create_invoice buyer 1000000u64 ...` | ✓ 返回两个 records |
| 最小金额 | `leo run create_invoice buyer 1u64 ...` | ✓ 成功创建 |
| 最大金额 | `leo run create_invoice buyer 18446744073709551615u64 ...` | ✓ 成功创建 |
| 验证正确哈希 | `leo run verify_invoice record hash` | ✓ 返回 true |
| 买家标记支付 | `leo run mark_as_paid buyer_record nonce` | ✓ 返回收据 |
| 卖家创建收据 | `leo run create_seller_receipt id buyer seller amt nonce` | ✓ 返回收据 |
| 卖家取消发票 | `leo run cancel_invoice seller_record` | ✓ status=2 |
| 验证匹配支付 | `leo run verify_payment receipt invoice` | ✓ 返回 true |

## ❌ 应该失败的测试

| 测试 | 命令 | 预期错误 |
|------|------|---------|
| 卖家=买家 | `leo run create_invoice {caller} ...` | ❌ assert_neq |
| 金额为0 | `leo run create_invoice buyer 0u64 ...` | ❌ assert |
| 非买家标记 | `leo run mark_as_paid buyer_record ...` (as seller) | ❌ assert_eq |
| 重复标记 | `leo run mark_as_paid paid_invoice ...` | ❌ assert_eq |
| 非卖家取消 | `leo run cancel_invoice seller_record` (as buyer) | ❌ assert_eq |
| 取消已付款 | `leo run cancel_invoice paid_invoice` | ❌ assert_eq |

## 📊 测试覆盖率

```
功能                  测试用例数   覆盖率
─────────────────────────────────────
create_invoice          6         100%
verify_invoice          2         100%
mark_as_paid            3         100%
create_seller_receipt   3         100%
cancel_invoice          2         100%
verify_payment          2         100%
完整工作流              2         100%
─────────────────────────────────────
总计                   20         100%
```

## 🧪 测试数据

### 地址
```
卖家: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc
买家: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc
```

### 常用值
```
amount:        1000000u64
due_date:      1735689600u32
invoice_hash:  123456789field
nonce:         99999field
payment_nonce: 88888field
```

## 🛠 实用命令

```bash
# 查看 Leo 版本
leo --version

# 构建项目
leo build

# 清理构建
leo clean

# 查看帮助
leo help

# 运行所有自动化测试
./run_tests.sh

# 运行特定测试
./run_tests.sh create_invoice
./run_tests.sh create_seller_receipt
```

## 📁 测试文件位置

```
tests/
├── README.md                      # 测试说明文档
├── TESTING_GUIDE.md               # 详细测试指南
├── QUICK_REFERENCE.md             # 本文件
├── test_zk_invoice.leo            # 测试套件（20个测试用例）
└── inputs/                        # 测试输入文件
    ├── create_invoice.in
    ├── verify_invoice.in
    ├── mark_as_paid.in
    ├── create_seller_receipt.in
    ├── cancel_invoice.in
    └── verify_payment.in

run_tests.sh                       # 自动化测试脚本
```

## 🔍 调试技巧

```bash
# 详细输出
leo run --verbose create_invoice ...

# 查看构建输出
leo build --verbose

# 检查程序语法
leo check
```

## 💡 提示

1. **Record 只能使用一次** - 每次操作都会消耗输入的 record
2. **保存 Record** - 将输出复制到文件中以备后用
3. **参数顺序** - 确保参数顺序与函数签名匹配
4. **类型匹配** - 注意 u64, u32, field, address 等类型
5. **账户切换** - 使用不同私钥测试不同角色

## 📞 获取帮助

- 详细测试步骤: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- 测试说明: [README.md](README.md)
- Leo 文档: https://developer.aleo.org/leo
- Aleo 开发者门户: https://developer.aleo.org

## 🎯 测试检查清单

复制此清单进行测试跟踪：

```
基础功能测试:
[ ] create_invoice - 正常
[ ] create_invoice - 边界值
[ ] verify_invoice - 匹配/不匹配
[ ] mark_as_paid - 正常
[ ] create_seller_receipt - 正常
[ ] cancel_invoice - 正常
[ ] verify_payment - 匹配/不匹配

工作流测试:
[ ] 完整创建到支付流程
[ ] payment_id 一致性

负面测试:
[ ] 所有应该失败的测试

安全测试:
[ ] 哈希一致性
[ ] Record 不可重用
```

---

**快速运行完整测试:**
```bash
./run_tests.sh && echo "✓ 所有自动化测试通过！"
```
