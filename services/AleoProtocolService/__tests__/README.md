# AleoProtocolService 测试说明

## 测试文件

- `AleoProtocolService.test.ts` - AleoProtocolService 类的单元测试

## 运行测试

```bash
# 运行所有测试
npm test

# 运行 AleoProtocolService 测试
npm test AleoProtocolService

# 监视模式
npm test -- --watch

# 生成覆盖率报告
npm test -- --coverage
```

## 测试覆盖范围

### ✅ 核心功能测试

1. **构造函数**
   - ✅ 创建实例
   - ✅ 默认使用 TestnetBeta 网络

2. **getPublicBalance() - 获取公开余额**
   - ✅ 成功获取公开余额（带 u64 后缀）
   - ✅ 处理没有 u64 后缀的余额
   - ✅ 处理带引号的响应（如 `"60000000u64"`）
   - ✅ 处理带单引号的响应
   - ✅ 当地址没有公开余额时返回 0（404 响应）
   - ✅ 当余额为空字符串时返回 0
   - ✅ 当网络错误时返回 0 并打印警告
   - ✅ 处理大额余额
   - **说明**: 从链上 Mapping 查询 credits.aleo 程序的 account mapping，自动处理各种响应格式（带引号、带 u64 后缀等）

3. **getLatestBlockHeight() - 获取最新区块高度**
   - ✅ 成功获取最新区块高度
   - ✅ 网络连接失败时抛出错误
   - **说明**: 用于 Controller 决定扫描的终点

4. **网络配置**
   - ✅ 为 MainnetBeta 使用正确的 RPC URL
   - ✅ 为 Testnet 使用正确的 RPC URL
   - ✅ 为 TestnetBeta 使用正确的 RPC URL
   - ✅ 默认使用 TestnetBeta

5. **estimateExecutionFee() - 估算执行费用**
   - ✅ 成功估算执行费用并增加 20% 冗余
   - ✅ 处理大额费用估算
   - ✅ 处理零费用（边界情况）
   - ✅ 当 buildAuthorization 失败时返回降级值（250,000 microcredits）
   - ✅ 当 estimateFeeForAuthorization 失败时返回降级值
   - ✅ 当抛出 ProtocolServiceError 时重新抛出
   - ✅ 正确传递不同的输入参数
   - ✅ 为不同的程序名称正确调用
   - **说明**: 通过构建 Authorization 并使用 SDK 的 estimateFeeForAuthorization 进行预估，增加 20% 冗余以确保交易能够成功执行。如果 SDK 预估失败，返回降级方案：250,000 microcredits（0.25 credits）

6. **verifyRecordOnChain() - 验证 record 是否上链成功**
   - ✅ 成功验证交易已上链（无额外选项）
   - ✅ 成功验证交易属于指定程序
   - ✅ 失败当交易不属于指定程序
   - ✅ 成功验证交易调用了指定函数
   - ✅ 失败当交易未调用指定函数
   - ✅ 成功验证输出 record 数量
   - ✅ 失败当输出 record 数量不匹配
   - ✅ 成功验证所有选项（程序、函数、输出数量）
   - ✅ 处理交易不存在的情况
   - ✅ 处理交易格式为 transitions 数组的情况
   - ✅ 处理网络错误
   - ✅ 处理空的 transitions 数组
   - ✅ 处理没有 outputs 的交易
   - **说明**: 通过查询交易详情来验证交易是否已确认，并可选择性地验证交易中是否包含预期的 record。支持验证程序 ID、函数名称和输出 record 数量。兼容多种交易格式（execution.transitions、transitions、outputs 等）

### ⏳ 待实现功能测试

以下功能在接口中已定义，但实现中标记为 TODO，暂未编写测试：

- `fetchRawRecords()` - 获取指定地址在特定程序下的所有加密 Record
- `getInvoiceMappingStatus()` - 查询链上发票状态 Mapping
- `broadcastTransaction()` - 广播已生成的零知识证明交易到 Aleo 网络
- `waitForTransaction()` - 等待交易确认

## 测试策略

### 单元测试原则

1. **隔离性** - 每个测试独立，使用 mock 隔离外部依赖（fetch API）
2. **可读性** - 使用 AAA 模式（Arrange-Act-Assert）
3. **完整性** - 覆盖正常流程和异常情况
4. **可维护性** - 测试代码清晰，易于理解和修改

### Mock 策略

- 使用 `vi.fn()` 和 `vi.hoisted()` 模拟外部依赖
- Mock `@provablehq/sdk` 的 `AleoNetworkClient` 和 `ProgramManager`
- 在 `beforeEach` 中创建新的服务实例并重置所有 mock
- 在 `afterEach` 中清理所有 mock
- 针对不同场景配置不同的 mock 响应（成功、失败、错误等）

### 错误测试

- 测试网络连接失败场景
- 测试 404 响应（地址没有公开余额）
- 测试 500 响应（服务器错误）
- 验证错误消息和错误码的正确性
- 验证 ProtocolServiceError 的错误类型和错误码

### 响应格式处理测试

- 测试带 u64 后缀的响应：`"5000000u64"`
- 测试不带 u64 后缀的响应：`"3000000"`
- 测试带双引号的响应：`"\"60000000u64\""`
- 测试带单引号的响应：`"'5000000u64'"`
- 测试空字符串响应：`""`

## API 端点

### 公开余额查询

- **端点**: `GET /program/credits.aleo/mapping/account/{address}`
- **Base URL**: 
  - Mainnet: `https://api.explorer.provable.com/v2/mainnet`
  - Testnet: `https://api.explorer.provable.com/v2/testnet`
- **Headers**: `Accept: application/json`
- **响应格式**: 可能包含引号和 u64 后缀，如 `"60000000u64"` 或 `60000000u64`

### 最新区块高度查询

- **端点**: `GET /{chainId}/latest/height`
- **Chain ID**: 
  - MainnetBeta: `mainnet`
  - Testnet: `testnet3`
  - TestnetBeta: `testnetbeta`

## 测试覆盖率目标

- **行覆盖率**: > 95%
- **分支覆盖率**: > 90%
- **函数覆盖率**: 100%

## 错误处理

### ProtocolServiceError 错误类型

- `NODE_CONNECTION_FAILED` - 无法连接到 Aleo 节点（RPC 失败）
- `INVALID_RECORD` - Record 格式解析错误（待实现）
- `TRANSACTION_REJECTED` - 节点拒绝接收交易（待实现）
- `SYNC_TIMEOUT` - 区块同步超时（待实现）
- `MAPPING_NOT_FOUND` - 链上找不到指定的 Mapping（待实现）

### 错误处理策略

- **404 响应**: 对于 `getPublicBalance()`，返回 `0n` 而不是抛出错误（地址可能没有公开余额）
- **非 404 错误响应**: 对于 `getPublicBalance()`，返回 `0n` 并打印警告
- **网络错误**: 对于 `getLatestBlockHeight()`，抛出 `ProtocolServiceError` 并包含错误码 `NODE_CONNECTION_FAILED`

## 费用估算说明

### estimateExecutionFee 实现细节

1. **两步估算流程**：
   - 第一步：调用 `ProgramManager.buildAuthorization()` 构建 Authorization 对象
   - 第二步：调用 `ProgramManager.estimateFeeForAuthorization()` 进行费用预估

2. **冗余策略**：
   - 在基础费用上增加 20% 冗余，确保交易能够成功执行
   - 计算公式：`最终费用 = 基础费用 * 1.2`

3. **降级方案**：
   - 当 SDK 预估失败时（网络错误、程序未部署等），返回硬编码值：250,000 microcredits（0.25 credits）
   - 这是一个保守的估算值，适用于大多数简单的合约调用

4. **错误处理**：
   - 如果抛出 `ProtocolServiceError`，直接重新抛出（不降级）
   - 其他错误（如网络错误、SDK 错误）会触发降级方案

## verifyRecordOnChain 实现细节

### 验证逻辑

1. **基础验证**：
   - 查询交易是否存在且已确认（交易存在即表示已确认）
   - 如果交易不存在，返回 `verified: false`

2. **程序 ID 验证**（可选）：
   - 检查交易中的 transitions 是否包含指定的程序
   - 支持多种交易格式：`execution.transitions`、`transitions`
   - 支持程序名称的完全匹配和部分匹配

3. **函数名称验证**（可选）：
   - 检查交易中的 transitions 是否调用了指定的函数
   - 支持多种交易格式：`execution.transitions`、`transitions`

4. **输出 Record 数量验证**（可选）：
   - 从交易中提取输出 record 数量
   - 支持多种格式：
     - `execution.outputs`（优先）
     - `transitions[].outputs`（汇总所有 transitions 的输出）
     - `transaction.outputs`（降级方案）
   - 验证实际输出数量是否与预期一致

### 返回值

```typescript
{
  verified: boolean;      // 验证是否通过
  transaction: any;       // 交易详情对象
  message: string;        // 验证结果消息
}
```

### 错误处理

- 如果查询交易失败（网络错误等），抛出 `ProtocolServiceError`，错误码为 `NODE_CONNECTION_FAILED`
- 如果交易不存在，返回 `verified: false`，不抛出错误
- 如果验证失败（程序不匹配、函数不匹配、输出数量不匹配），返回 `verified: false`，不抛出错误

## 未来改进

- [ ] 实现并测试 `fetchRawRecords()` 方法
- [ ] 实现并测试 `getInvoiceMappingStatus()` 方法
- [ ] 实现并测试 `broadcastTransaction()` 方法
- [ ] 实现并测试 `waitForTransaction()` 方法
- [ ] 添加性能测试
- [ ] 添加压力测试
- [ ] 添加端到端测试
- [ ] 测试并发场景
- [ ] 添加超时处理测试
- [ ] 添加重试机制测试
- [ ] 优化费用估算的降级策略（根据程序类型动态调整）
- [ ] 增强 `verifyRecordOnChain` 功能：支持验证 record 的具体内容（如 invoice_id）

