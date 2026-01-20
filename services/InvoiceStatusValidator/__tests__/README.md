# InvoiceStatusValidator 测试说明

## 测试文件

- `InvoiceStatusValidatorImpl.test.ts` - 发票状态验证服务测试

## 运行测试

```bash
# 运行所有 InvoiceStatusValidator 相关测试
npm test services/InvoiceStatusValidator

# 运行特定测试文件
npm test InvoiceStatusValidatorImpl.test.ts
```

## 测试覆盖范围

### InvoiceStatusValidatorImpl 测试

1. **null 记录处理**
   - ✅ 对 null 记录返回 shouldConfirm: false

2. **PaymentRecord 处理**
   - ✅ PaymentRecord 总是返回 shouldConfirm: true
   - ✅ 忽略 action 类型

3. **InvoiceRecord with cancel action**
   - ✅ status 为 CANCELLED 时返回 shouldConfirm: true
   - ✅ status 不是 CANCELLED 时返回 shouldConfirm: false
   - ✅ 处理不同的非 CANCELLED 状态

4. **InvoiceRecord with pay action**
   - ✅ status 为 PAID 时返回 shouldConfirm: true
   - ✅ status 不是 PAID 时返回 shouldConfirm: false

5. **InvoiceRecord with create action**
   - ✅ create action 总是返回 shouldConfirm: true
   - ✅ 忽略 status 值

6. **InvoiceRecord without action**
   - ✅ originalStatus 和 recordStatus 都是 PENDING 时返回 shouldConfirm: true
   - ✅ status 已变化时返回 shouldConfirm: true
   - ✅ originalStatus 不是 PENDING 时返回 shouldConfirm: true

7. **边界情况**
   - ✅ 处理 EXPIRED 状态
   - ✅ 处理数字格式的 status

8. **集成测试**
   - ✅ 从创建到取消的完整验证流程
   - ✅ 从创建到支付的完整验证流程

## Mock 说明

- 使用 `vi.mock()` mock `cleanAleoNumber` 工具函数
- 模拟 Aleo 数字格式（移除 'u8' 后缀）

