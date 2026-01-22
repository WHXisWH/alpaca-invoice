# StorageService 测试文档

## 概述

本测试套件为 `StorageService` 提供了全面的单元测试。`StorageService` 是一个通用的存储服务，支持任意类型的数据存储，通过 `tableName` 区分不同的数据表。

## 核心特性

### 通用存储接口

`StorageService` 提供了以下通用接口：

1. **`addData<T>(tableName, key, data)`** - 添加单个数据到指定表
   - **`addData<T>(tableName, dataList)`** - 批量添加数据（支持数组）
2. **`getData<T>(tableName, key)`** - 通过 key 获取数据
3. **`getAllData<T>(tableName)`** - 获取指定表的所有数据
4. **`updateData<T>(tableName, key, updates)`** - 更新部分数据
5. **`resetAllData<T>(tableName, dataList)`** - 全量重置表数据
6. **`deleteData(tableName, key)`** - 删除单个数据
   - **`deleteData(tableName, keys)`** - 批量删除数据（支持数组）

### 自动序列化/反序列化

服务自动处理以下类型的序列化/反序列化：
- **BigInt** - 自动转换为字符串存储，读取时恢复为 BigInt
- **Date** - 自动转换为时间戳存储，读取时恢复为 Date 对象
- **嵌套对象和数组** - 递归处理

### 动态表创建

服务支持动态创建表，首次使用某个表名时会自动创建对应的 IndexedDB 对象存储。

## 测试覆盖范围

### 1. addData（添加数据）
- ✅ 成功保存数据到指定表
- ✅ 支持保存包含 Date 的数据
- ✅ 支持保存包含 bigint 的数据
- ✅ 能够覆盖已存在的数据
- ✅ 支持批量添加数据
- ✅ 支持批量添加包含 BigInt 和 Date 的数据

### 2. getData（获取数据）
- ✅ 成功读取已保存的数据
- ✅ 返回 undefined 当数据不存在时
- ✅ 正确反序列化复杂数据结构（包含 BigInt、Date、嵌套对象等）

### 3. getAllData（获取所有数据）
- ✅ 返回指定表的所有数据
- ✅ 返回空数组当表为空时
- ✅ 正确反序列化所有数据

### 4. updateData（更新数据）
- ✅ 成功更新部分数据
- ✅ 在数据不存在时抛出错误
- ✅ 保留未更新的字段

### 5. resetAllData（重置数据）
- ✅ 清空表并重置为新的数据列表
- ✅ 支持空数据列表
- ✅ 从数据中自动提取 key（优先使用 id、invoiceHash 等字段）

### 6. deleteData（删除数据）
- ✅ 成功删除指定数据
- ✅ 能够删除不存在的键而不报错
- ✅ 支持批量删除数据
- ✅ 支持批量删除部分数据（保留其他数据）

### 7. 多表支持
- ✅ 支持多个不同的表
- ✅ 在不同表中使用相同的 key

### 8. 错误处理
- ✅ 在服务器端环境中抛出错误

### 9. 集成测试
- ✅ 完成完整的数据生命周期（创建、读取、更新、删除）

## 技术实现

### IndexedDB 模拟

由于测试在 Node.js 环境中运行，而 IndexedDB 是浏览器 API，测试使用了自定义的 IndexedDB 模拟实现：

- 使用 `Map` 数据结构模拟对象存储
- 使用 Promise 模拟异步操作
- 实现了基本的 `get`、`put`、`delete`、`getAll`、`clear` 操作
- 支持数据库版本升级和动态表创建

### 序列化/反序列化

服务使用自定义的序列化/反序列化逻辑：

- **BigInt** → 字符串 → BigInt
- **Date** → `{ __type: 'Date', value: timestamp }` → Date
- **对象和数组** → 递归处理

### 测试环境设置

每个测试用例都会：
1. 在 `beforeEach` 中设置 IndexedDB 模拟环境
2. 在 `afterEach` 中清理全局变量

## 使用示例

### 基本用法

```typescript
import { StorageService } from '@/services/StorageService/StorageServiceImpl';

const storage = new StorageService();

// 添加单个数据
await storage.addData('invoices', 'invoice-1', {
  id: 'invoice-1',
  amount: BigInt('1000000'),
  dueDate: new Date('2024-12-31'),
  status: 'pending'
});

// 批量添加数据
await storage.addData('invoices', [
  { key: 'invoice-1', data: { id: '1', amount: BigInt('1000') } },
  { key: 'invoice-2', data: { id: '2', amount: BigInt('2000') } },
  { key: 'invoice-3', data: { id: '3', amount: BigInt('3000') } },
]);

// 获取数据
const invoice = await storage.getData('invoices', 'invoice-1');

// 更新数据
await storage.updateData('invoices', 'invoice-1', {
  status: 'paid'
});

// 获取所有数据
const allInvoices = await storage.getAllData('invoices');

// 重置数据
await storage.resetAllData('invoices', [
  { id: '1', amount: BigInt('1000') },
  { id: '2', amount: BigInt('2000') }
]);

// 删除单个数据
await storage.deleteData('invoices', 'invoice-1');

// 批量删除数据
await storage.deleteData('invoices', ['invoice-1', 'invoice-2', 'invoice-3']);
```

### 多表使用

```typescript
// 存储发票
await storage.addData('invoices', 'inv-1', { id: 'inv-1', amount: 1000 });

// 存储设置
await storage.addData('settings', 'theme', { key: 'theme', value: 'dark' });

// 两个表互不干扰
const invoice = await storage.getData('invoices', 'inv-1');
const setting = await storage.getData('settings', 'theme');
```

## 运行测试

```bash
# 运行所有测试
npm test

# 运行 StorageService 测试
npm test StorageService

# 监视模式
npm test -- --watch
```

## 注意事项

1. **异步操作**：所有存储操作都是异步的，测试中使用了 `async/await` 来正确处理。

2. **数据序列化**：服务自动处理 `bigint` 和 `Date` 的序列化/反序列化，测试验证了这些转换的正确性。

3. **表名管理**：表名用于区分不同的数据表，可以是任意字符串（如 'invoices'、'settings'、'users' 等）。

4. **Key 提取**：`resetAllData` 方法会自动从数据中提取 key，优先使用 `id`、`invoiceHash` 等字段。

5. **错误处理**：测试覆盖了各种错误场景，包括服务器端环境、不存在的记录等。

## 未来改进

1. 考虑添加批量操作接口（批量添加、批量更新等）
2. 添加索引支持，提高查询性能
3. 添加数据迁移功能，支持数据结构变更
4. 添加性能测试，验证大量数据下的操作性能
5. 添加并发测试，验证多操作场景下的数据一致性
