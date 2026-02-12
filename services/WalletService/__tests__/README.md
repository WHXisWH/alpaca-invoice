# WalletService 测试说明

## 测试文件

- `WalletService.test.ts` - WalletService 类的单元测试

## 运行测试

```bash
# 运行所有测试
npm test

# 运行 WalletService 测试
npm test WalletService

# 监视模式
npm test -- --watch

# 生成覆盖率报告
npm test -- --coverage
```

## 测试覆盖范围

### ✅ 核心功能测试

1. **构造函数**
   - 创建实例

2. **connect() - 连接钱包**
   - ✅ 成功连接并返回地址
   - ✅ 连接后没有地址时抛出错误
   - ✅ 用户拒绝连接时的错误处理
   - ✅ 其他错误的错误处理

3. **disconnect() - 断开连接**
   - ✅ 成功断开连接
   - ✅ 断开失败时的错误处理

4. **getPrivateBalance() - 获取私有余额**
   - ✅ 成功获取私有余额
   - ✅ 过滤已花费的 Records
   - ✅ 未连接时抛出错误
   - ✅ 不支持 Records 时返回 0
   - ✅ 使用 requestRecordPlaintexts 作为后备方案
   - ✅ 不支持请求 Records 时返回 0
   - ✅ 没有 Records 时返回 0
   - ✅ 正确过滤已花费的 Records
   - ✅ 正确计算复杂场景下的余额
   - **说明**: 不需要自己管理 ViewKey，钱包适配器的 requestRecords 会自动利用钱包内部的 ViewKey 解密属于当前用户的 credits Record

5. **getFeeRecords() - 获取手续费 Records**
   - ✅ 成功获取足够的 Records
   - ✅ 余额不足时抛出错误
   - ✅ 未连接时抛出错误
   - ✅ 不支持请求 Records 时抛出错误

6. **signMessage() - 签名消息**
   - ✅ 成功签名消息
   - ✅ 未连接时抛出错误
   - ✅ 消息为空时抛出错误
   - ✅ 钱包不支持时抛出错误
   - ✅ 返回空签名时抛出错误
   - ✅ 用户拒绝时的错误处理

7. **requestTransaction() - 请求创建交易**
   - ✅ 成功请求交易
   - ✅ 使用自定义 programId
   - ✅ 使用自定义手续费金额
   - ✅ 使用自定义 chainId
   - ✅ 未连接时抛出错误
   - ✅ 钱包不存在时抛出错误
   - ✅ 钱包不支持时抛出错误
   - ✅ 返回空结果时抛出错误
   - ✅ 用户拒绝时的错误处理
   - ✅ 网络不匹配时的错误处理
   - ✅ 其他错误的错误处理
   - ✅ 处理包含多个输入的复杂交易

### ✅ 集成测试

- ✅ 完整的连接 -> 签名消息 -> 断开流程
- ✅ 复杂场景下的余额计算

## 测试策略

### 单元测试原则

1. **隔离性** - 每个测试独立，使用 mock 隔离外部依赖
2. **可读性** - 使用 AAA 模式（Arrange-Act-Assert）
3. **完整性** - 覆盖正常流程和异常情况
4. **可维护性** - 测试代码清晰，易于理解和修改

### Mock 策略

- 使用 `vi.fn()` 模拟钱包方法
- 在 `beforeEach` 中重置 mock 状态
- 针对不同场景配置不同的 mock 行为

### 错误测试

- 测试用户拒绝操作的场景
- 测试钱包不支持某些功能的场景
- 测试网络错误等异常情况
- 验证错误消息的友好性

## 测试覆盖率目标

- **行覆盖率**: > 95%
- **分支覆盖率**: > 90%
- **函数覆盖率**: 100%

## requestTransaction 方法说明

### 方法签名

```typescript
async requestTransaction(params: RequestTransactionParams): Promise<any>
```

### 参数说明

`RequestTransactionParams` 对象包含以下字段：

- `functionName`: 要调用的函数名（如 "create_invoice", "pay_invoice"）
- `inputs`: 函数输入参数数组
- `publicKey`: 钱包公钥地址（用于验证连接状态）
- `programId`: 程序ID（可选，默认为 "zk_invoice_v2.aleo"）
- `feeRecord`: 可选的手续费 Record（如果不提供，钱包会自动选择）
- `fee`: 手续费金额，单位为 microcredits（可选，默认为 250000）
- `chainId`: 链ID（可选，默认从环境变量获取）

### 返回值

返回交易结果对象，通常包含 `transactionId` 字段。

### 错误处理

- `UNAUTHORIZED`: 钱包未连接或方法不支持
- `NOT_INSTALLED`: 钱包未安装
- `USER_REJECTED`: 用户拒绝了交易请求
- `NETWORK_MISMATCH`: 钱包网络与应用要求不匹配

### 使用示例

```typescript
const walletService = new WalletService(walletAdapter);

// 基本用法
const result = await walletService.requestTransaction({
  functionName: 'create_invoice',
  inputs: ['aleo1buyer123', '1000000u64', '1735689600u32', 'hash123', 'nonce456'],
  publicKey: publicKey
});

// 使用自定义 programId 和手续费
const result = await walletService.requestTransaction({
  functionName: 'transfer_private',
  inputs: ['record123', 'aleo1recipient', '1000000u64'],
  publicKey: publicKey,
  programId: 'credits.aleo',
  fee: 1_000_000
});
```

## 未来改进

- [ ] 添加性能测试
- [ ] 添加压力测试
- [ ] 添加端到端测试
- [ ] 测试并发场景
