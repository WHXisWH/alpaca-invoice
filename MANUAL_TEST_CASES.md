# Alpaca Invoice — 手动测试用例 (v2 合约适配)

> 基于 `zk_invoice_v2_2.aleo` 合约，覆盖所有前端页面和核心功能。
> 需要两个 Aleo 钱包地址（Wallet A = Seller，Wallet B = Buyer）。
> 网络：Aleo Testnet Beta

---

## 前置准备

| 项目 | 说明 |
|------|------|
| Wallet A | 卖方钱包，确保有 ≥ 5 credits（用于支付 gas） |
| Wallet B | 买方钱包，确保有 ≥ 5 credits |
| 浏览器 | Chrome / Edge，安装 Leo Wallet 扩展 |
| 环境 | `npm run dev` 本地运行或 Vercel 部署地址 |

---

## 一、钱包连接与授权

### TC-1.1 未连接钱包访问 Dashboard

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 打开 `/dashboard` | 显示 "Connect Wallet" 提示界面，含钱包图标 |
| 2 | 确认无统计数据、无发票列表 | Quick Actions、Sent/Received 区域不显示 |

### TC-1.2 未连接钱包访问 Invoices 列表

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 打开 `/invoices` | 显示 "Connect Wallet" 空状态 |

### TC-1.3 连接 Wallet A

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击页面顶部的钱包连接按钮 | Leo Wallet 弹窗请求连接 |
| 2 | 在 Leo Wallet 中点击 Approve | 页面更新，显示钱包地址 |
| 3 | 访问 `/dashboard` | 显示统计卡片和 Quick Actions |

### TC-1.4 解锁私有数据（首次）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 连接钱包后访问 `/invoices` | 显示 "Unlock Private Data" 弹窗 |
| 2 | 点击 "Unlock" | Leo Wallet 弹出签名请求 |
| 3 | 批准签名 | 页面加载发票列表（首次可能为空） |

### TC-1.5 断开钱包

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击钱包按钮 → Disconnect | 钱包断开，页面回到 "Connect Wallet" 状态 |

---

## 二、创建发票（Seller 侧）

> 使用 Wallet A 作为 Seller

### TC-2.1 正常创建发票

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 导航到 `/invoices/create` | 显示创建表单，Seller address 自动填充为 Wallet A 地址 |
| 2 | 填写 Buyer address = Wallet B 的地址 | 输入框正常接受 aleo1... 格式地址 |
| 3 | Amount = `1`（1 credit） | 输入框接受数字 |
| 4 | Description = `Test service fee` | 正常输入 |
| 5 | Due date = 7 天后的日期 | 日期选择器正常 |
| 6 | 点击 "Create invoice" | (a) 进度条出现，显示进度百分比和日志 |
| | | (b) Leo Wallet 弹出交易确认 |
| 7 | 在 Leo Wallet 中批准交易 | (a) 进度继续推进 |
| | | (b) 完成后自动跳转到发票详情页 `/invoices/{hash}` |
| 8 | 检查详情页 | (a) 状态显示 "⏳ Sending" |
| | | (b) Amount 显示 `1.00 credits` |
| | | (c) Buyer 显示 Wallet B 地址 |
| | | (d) Seller 显示 Wallet A 地址 |
| | | (e) Your Role 显示 "🏪 Seller" |
| | | (f) **Tax Amount 显示 `0.00 credits`**（v2 新增字段） |
| | | (g) **Currency 显示 `CREDITS`**（v2 新增字段） |
| | | (h) **Order ID 显示 INV-... 值**（v2 新增字段） |

> **重点验证**：此测试用例验证了 P0 修复（create_invoice 参数顺序）。如果参数顺序仍然错误，合约会拒绝交易，步骤 7 会失败。

### TC-2.2 Buyer 地址格式校验

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Buyer address 输入 `invalid_address` | 点击 Create 后提示地址格式错误 |
| 2 | Buyer address 输入 `aleo1abc`（过短） | 提示地址格式错误 |
| 3 | Buyer address 输入 Wallet A 自身地址 | 提示不能给自己开发票 |

### TC-2.3 金额边界测试

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Amount = `0` | 交易是否被拒绝或表单校验失败 |
| 2 | Amount = `0.01`（10000 microcredits） | 正常创建 |
| 3 | Amount = `999999`（大金额） | 视 gas 情况，正常创建或报余额不足 |

### TC-2.4 创建发票 + 同时设置审计授权

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 填写正常的发票信息 | — |
| 2 | 勾选 "Audit authorization" → Enable | 展开审计授权区域 |
| 3 | Audit key 输入 `my-audit-key-123` | 正常接受 |
| 4 | Expiry 选择 7 天后 | 正常选择 |
| 5 | Scopes 勾选 amount、buyer、seller | checkbox 正常切换 |
| 6 | 点击 Create invoice | (a) 先发起 create_invoice 交易 |
| | | (b) 成功后自动发起 set_audit_authorization 交易 |
| | | (c) 两笔交易都需要在 Leo Wallet 中批准 |

---

## 三、发票列表与筛选

### TC-3.1 发票列表展示

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 使用 Wallet A 访问 `/invoices` | 看到至少 TC-2.1 创建的发票 |
| 2 | 发票卡片显示 | (a) 金额、状态、角色标签 |
| | | (b) "As Seller" 标签 |
| | | (c) 链上确认状态（Sending / Confirmed） |

### TC-3.2 Tab 筛选

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击 "All" tab | 显示所有发票 |
| 2 | 点击 "Pending" tab | 仅显示 PENDING 状态发票 |
| 3 | 点击 "Paid" tab | 仅显示 PAID 状态发票（如有） |
| 4 | 点击 "Cancelled" tab | 仅显示 CANCELLED 状态发票（如有） |

### TC-3.3 搜索功能

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 在搜索框输入发票 ID 的前几个字符 | 列表筛选出匹配的发票 |
| 2 | 输入 Wallet B 的地址片段 | 筛选出与该买方相关的发票 |
| 3 | 输入不存在的字符串 | 显示 "No invoices found" |

### TC-3.4 Sync 按钮

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击 "Sync" 按钮 | 按钮旋转动画，文字变为 "Syncing..." |
| 2 | 等待同步完成 | 发票状态从 "Sending" 变为 "Confirmed"（如已上链） |

---

## 四、发票详情页

### TC-4.1 Seller 视角查看详情

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 使用 Wallet A 点击 PENDING 发票进入详情 | — |
| 2 | 检查基本字段 | Invoice ID、Amount、Buyer、Seller、Due Date、Created At 正确 |
| 3 | **检查 v2 新增字段** | Tax Amount、Currency、Order ID 显示正确（非空） |
| 4 | Your Role 显示 | "🏪 Seller" |
| 5 | 操作按钮 | 显示 "❌ Cancel Invoice" 按钮（Seller 可取消） |
| 6 | Line items 区域 | 如果有 details，显示 line items 列表和 total |

### TC-4.2 链上确认状态

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 刚创建的发票（未上链） | 显示 "⏳ Sending" 标签 |
| 2 | 等待几分钟后刷新 | 标签变为 "✓ Confirmed (Found on Chain)" |
| 3 | 确认后出现 "Sync Status" 按钮 | 点击可手动同步最新状态 |

### TC-4.3 审计锚点展示

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 详情页底部 "Audit anchors" 区域 | 显示 Commitment root、Rules result、Field commitments、Audit authorization、Seller audit counter |
| 2 | 链上确认后 | 各锚点值从 "N/A" 变为实际的 field 值 |

### TC-4.4 下载审计包

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击 "Download minimal package" | 下载 JSON 文件，包含 amount, tax_amount, due_date, buyer, seller 字段 |
| 2 | 点击 "Download full package" | 下载 JSON 文件，额外包含 currency, items_hash, memo_hash, order_id 字段 |
| 3 | 打开下载的 JSON | 格式正确，包含 version、programId、invoiceId、cipher 等完整结构 |

---

## 五、支付发票（Buyer 侧）

> 切换到 Wallet B

### TC-5.1 Buyer 查看收到的发票

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 使用 Wallet B 连接并解锁 | — |
| 2 | 访问 `/invoices` | 看到 TC-2.1 创建的发票（状态: PENDING） |
| 3 | 角色标签 | "As Buyer" |

### TC-5.2 支付发票

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击 PENDING 发票进入详情页 | Your Role 显示 "🛒 Buyer" |
| 2 | 确认链上状态为 "Confirmed" | "💳 Pay Invoice" 按钮可用 |
| 3 | 点击 "💳 Pay Invoice" | Leo Wallet 弹出交易确认（mark_as_paid） |
| 4 | 批准交易 | (a) 按钮变为 "Processing..." |
| | | (b) 交易发送到链上 |
| 5 | 等待链上确认 | 发票状态变为 PAID（✅ This invoice has been paid） |

### TC-5.3 不能对 Sending 状态的发票进行支付

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 在列表页找到一个 "Sending" 状态的发票 | — |
| 2 | 点击 "Pay" 按钮（如果在列表卡片上） | 弹出 toast 提示 "Not ready yet"，阻止支付 |

---

## 六、取消发票（Seller 侧）

> 切换回 Wallet A

### TC-6.1 取消 PENDING 发票

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 使用 Wallet A 找到一个 PENDING 且已 Confirmed 的发票 | — |
| 2 | 进入详情页，点击 "❌ Cancel Invoice" | Leo Wallet 弹出交易确认（cancel_invoice） |
| 3 | 批准交易 | (a) 按钮变为 "Cancelling..." |
| | | (b) 交易发送到链上 |
| 4 | 等待链上确认 | 发票状态变为 CANCELLED（❌ This invoice has been cancelled） |
| 5 | 操作按钮 | 取消/支付按钮消失 |

### TC-6.2 Buyer 不能取消发票

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 使用 Wallet B 进入某个 PENDING 发票详情 | Your Role = "🛒 Buyer" |
| 2 | 检查操作按钮 | 只显示 "💳 Pay Invoice"，不显示取消按钮 |

---

## 七、链上同步与数据映射

> 此部分验证 P1 修复（v2 字段从链上正确映射）

### TC-7.1 创建发票后链上同步验证

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 创建一张新发票（TC-2.1） | — |
| 2 | 等待链上确认 | — |
| 3 | 点击 "Sync Status" 按钮 | 触发链上记录同步 |
| 4 | 检查详情页 | (a) Amount 与创建时一致 |
| | | (b) **Tax Amount 显示 `0.00 credits`**（从链上同步回来） |
| | | (c) **Currency 字段显示**（非空 field 值） |
| | | (d) **Order ID 字段显示**（非空 field 值） |
| | | (e) 状态与链上一致 |

### TC-7.2 支付后链上同步验证

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 支付一张发票（TC-5.2） | — |
| 2 | 使用 Seller 钱包查看该发票 | — |
| 3 | 点击 "Sync Status" | 发票状态更新为 PAID |

---

## 八、Dashboard 统计

### TC-8.1 统计数据准确性

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 访问 `/dashboard` | — |
| 2 | 检查 "Sent" 卡片 | 数字 = 你用当前钱包创建的发票总数 |
| 3 | 检查 "Received" 卡片 | 数字 = 别人发给你的发票总数 |
| 4 | 检查 "Pending" 卡片 | 数字 = 所有 PENDING 状态发票数 |
| 5 | 检查 "Completed" 卡片 | 数字 = 所有 PAID 状态发票数 |
| 6 | 如有 Sending 发票 | 显示 "Syncing" 卡片，带旋转图标 |

### TC-8.2 Quick Actions 导航

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击 "Create Invoice" | 跳转到 `/invoices/create` |
| 2 | 点击 "Pending" | 跳转到 `/invoices?filter=pending` |
| 3 | 点击 "Receipts" | 跳转到 `/receipts` |
| 4 | 点击 "Audit" | 跳转到 `/audit` |

---

## 九、收据页面

### TC-9.1 查看收据

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 完成一笔支付后，访问 `/receipts` | — |
| 2 | 检查收据列表 | 显示支付收据，含 payment_id、invoice_id、金额、时间 |

---

## 十、验证页面（Walletless）

### TC-10.1 正常验证

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 访问 `/verify` | 页面显示，标题包含 Program ID `zk_invoice_v2_2.aleo` |
| 2 | 输入一个已上链发票的 invoice_id（field 格式） | — |
| 3 | 点击 "Check on-chain" | 返回结果：Exists: Yes, Hash: (field值), Status: PENDING/PAID/CANCELLED |

### TC-10.2 不存在的发票

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 输入 `99999field` | — |
| 2 | 点击 "Check on-chain" | 返回：Exists: No |

### TC-10.3 格式校验

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 输入不以 `field` 结尾的字符串 | 报错提示 'Invoice ID must be a field (suffix "field")' |

---

## 十一、审计中心

### TC-11.1 生成审计包

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 访问 `/audit` | 左侧 "Generate Audit Package"，右侧 "Validate Audit Package" |
| 2 | 点击 "Refresh list" | 下拉框加载本地发票列表 |
| 3 | 选择一个已上链的发票 | Invoice ID 字段填充 |
| 4 | 设置 Expiration date = 7 天后 | — |
| 5 | 勾选 Fields: amount, buyer, seller | — |
| 6 | 点击 "Generate" | (a) 按钮变为 "Generating..." |
| | | (b) 成功后显示 JSON 预览 |
| | | (c) JSON 包含 version, invoice_id, cipher 等 |
| 7 | 点击 "Download JSON" | 下载审计包 JSON 文件 |

### TC-11.2 验证审计包

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 将 TC-11.1 下载的 JSON 内容粘贴到右侧 "Audit package JSON" 文本框 | — |
| 2 | 点击 "Validate" | (a) 显示 "Valid package" 或 "Invalid package" |
| | | (b) 如 valid，显示解密后的 payload |
| | | (c) 显示 On-chain anchors |
| | | (d) 显示 On-chain asserts（各项 ok/failed） |
| | | (e) 显示 Rule checks R1–R5 状态 |
| 3 | 点击 "Export snapshot" | 下载验证快照 JSON |

### TC-11.3 验证篡改过的审计包

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 复制一个有效的审计包 JSON | — |
| 2 | 修改其中的 `invoice_id` 为另一个值 | — |
| 3 | 粘贴并点击 "Validate" | 显示 "Invalid package"，验证失败 |

### TC-11.4 审计日志

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 验证几个审计包后 | 底部 "Audit log (local)" 区域显示验证记录 |
| 2 | 点击 "Export CSV" | 下载审计日志 CSV 文件 |
| 3 | 点击 "Clear" | 清空审计日志 |

---

## 十二、设置 / 审计授权

### TC-12.1 设置审计授权

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 访问 `/settings` | 显示 "Settings / Audit Authorization" 表单 |
| 2 | 输入已有发票的 Invoice ID | — |
| 3 | 输入 Audit key | — |
| 4 | 选择 Expiry 日期 | — |
| 5 | 勾选 Scopes（如 amount, buyer, seller） | — |
| 6 | 点击 "Set authorization" | Leo Wallet 弹出交易确认（set_audit_authorization） |
| 7 | 批准交易 | 提示 "Authorization submitted. Wait for chain confirmation." |

### TC-12.2 查询当前授权

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 输入已设置授权的 Invoice ID | — |
| 2 | 点击 "Fetch current" | 底部显示当前授权 JSON 数据 |

### TC-12.3 撤销审计授权

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 输入已设置授权的 Invoice ID | — |
| 2 | 点击 "Revoke" | Leo Wallet 弹出交易确认 |
| 3 | 批准交易 | 提示 "Authorization revoked (scopes_bitmask=0)." |

---

## 十三、Landing Page

### TC-13.1 访问 Landing Page

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 访问 `/`（根路径） | 显示产品介绍页面，含功能特点、流程图等 |
| 2 | 页面动画 | 滚动时元素正确出现，无抖动或闪烁 |
| 3 | 导航链接 | 点击 CTA 按钮可跳转到 Dashboard 或 Create Invoice |

---

## 十四、错误处理与边界情况

### TC-14.1 钱包拒绝交易

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 创建发票，在 Leo Wallet 弹窗中点 Reject | 页面显示友好错误提示，不崩溃 |

### TC-14.2 网络断开

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 断开网络后进行 Sync 操作 | 显示错误提示（如 NODE_CONNECTION_FAILED） |

### TC-14.3 发票不存在

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 直接访问 `/invoices/nonexistentfield` | 显示 "Invoice not found" 友好提示 |

### TC-14.4 已付款发票不能重复操作

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 查看 PAID 状态的发票详情 | 无 Pay/Cancel 按钮，显示 "✅ This invoice has been paid" |

### TC-14.5 已取消发票不能重复操作

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 查看 CANCELLED 状态的发票详情 | 无 Pay/Cancel 按钮，显示 "❌ This invoice has been cancelled" |

---

## 十五、v2 合约适配专项验证

> 这些用例专门验证此次 v2 修复是否生效

### TC-15.1 create_invoice 参数顺序（P0）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 创建一张发票（TC-2.1） | **交易成功上链**（不被合约拒绝） |
| 2 | 在 Aleo Explorer 中查看交易 | 14 个参数顺序为：buyer, amount, tax_amount, due_date, invoice_hash, nonce, current_time, order_id, currency, items_hash, memo_hash, line_items_sum, expected_total, tax_rate_bps |

### TC-15.2 链上 v2 字段同步（P1）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 创建发票并等待链上确认 | — |
| 2 | 点击 Sync Status 同步链上记录 | — |
| 3 | 检查详情页 v2 字段 | (a) Tax Amount 显示且为 `0.00 credits` |
| | | (b) Currency 显示为 field hash 或 "CREDITS"（如有 details） |
| | | (c) Order ID 显示为 field hash 或 "INV-..."（如有 details） |

### TC-15.3 AleoInvoiceRecord 必填字段（P1）

| 验证方式 | 说明 |
|----------|------|
| 代码检查 | `services/CryptoService/ICryptoService.ts` 中 `tax_amount`、`order_id`、`currency`、`items_hash`、`memo_hash` 均为必填（无 `?`） |
| 运行时验证 | 链上同步回来的记录不会因为可选标记而跳过这些字段的处理 |

### TC-15.4 详情页 v2 字段展示（P2）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 查看已上链发票详情 | Details 区域有 Tax Amount 行 |
| 2 | | Details 区域有 Currency 行 |
| 3 | | Details 区域有 Order ID 行 |

---

## 测试结果记录表

| 用例编号 | 测试日期 | 测试人 | 结果 | 备注 |
|----------|----------|--------|------|------|
| TC-1.1 | | | ☐ Pass / ☐ Fail | |
| TC-1.2 | | | ☐ Pass / ☐ Fail | |
| TC-1.3 | | | ☐ Pass / ☐ Fail | |
| TC-1.4 | | | ☐ Pass / ☐ Fail | |
| TC-1.5 | | | ☐ Pass / ☐ Fail | |
| TC-2.1 | | | ☐ Pass / ☐ Fail | |
| TC-2.2 | | | ☐ Pass / ☐ Fail | |
| TC-2.3 | | | ☐ Pass / ☐ Fail | |
| TC-2.4 | | | ☐ Pass / ☐ Fail | |
| TC-3.1 | | | ☐ Pass / ☐ Fail | |
| TC-3.2 | | | ☐ Pass / ☐ Fail | |
| TC-3.3 | | | ☐ Pass / ☐ Fail | |
| TC-3.4 | | | ☐ Pass / ☐ Fail | |
| TC-4.1 | | | ☐ Pass / ☐ Fail | |
| TC-4.2 | | | ☐ Pass / ☐ Fail | |
| TC-4.3 | | | ☐ Pass / ☐ Fail | |
| TC-4.4 | | | ☐ Pass / ☐ Fail | |
| TC-5.1 | | | ☐ Pass / ☐ Fail | |
| TC-5.2 | | | ☐ Pass / ☐ Fail | |
| TC-5.3 | | | ☐ Pass / ☐ Fail | |
| TC-6.1 | | | ☐ Pass / ☐ Fail | |
| TC-6.2 | | | ☐ Pass / ☐ Fail | |
| TC-7.1 | | | ☐ Pass / ☐ Fail | |
| TC-7.2 | | | ☐ Pass / ☐ Fail | |
| TC-8.1 | | | ☐ Pass / ☐ Fail | |
| TC-8.2 | | | ☐ Pass / ☐ Fail | |
| TC-9.1 | | | ☐ Pass / ☐ Fail | |
| TC-10.1 | | | ☐ Pass / ☐ Fail | |
| TC-10.2 | | | ☐ Pass / ☐ Fail | |
| TC-10.3 | | | ☐ Pass / ☐ Fail | |
| TC-11.1 | | | ☐ Pass / ☐ Fail | |
| TC-11.2 | | | ☐ Pass / ☐ Fail | |
| TC-11.3 | | | ☐ Pass / ☐ Fail | |
| TC-11.4 | | | ☐ Pass / ☐ Fail | |
| TC-12.1 | | | ☐ Pass / ☐ Fail | |
| TC-12.2 | | | ☐ Pass / ☐ Fail | |
| TC-12.3 | | | ☐ Pass / ☐ Fail | |
| TC-13.1 | | | ☐ Pass / ☐ Fail | |
| TC-14.1 | | | ☐ Pass / ☐ Fail | |
| TC-14.2 | | | ☐ Pass / ☐ Fail | |
| TC-14.3 | | | ☐ Pass / ☐ Fail | |
| TC-14.4 | | | ☐ Pass / ☐ Fail | |
| TC-14.5 | | | ☐ Pass / ☐ Fail | |
| TC-15.1 | | | ☐ Pass / ☐ Fail | |
| TC-15.2 | | | ☐ Pass / ☐ Fail | |
| TC-15.3 | | | ☐ Pass / ☐ Fail | |
| TC-15.4 | | | ☐ Pass / ☐ Fail | |

---

## 推荐测试顺序

> 按优先级和依赖关系排列

1. **TC-1.3** → 连接钱包（前置条件）
2. **TC-1.4** → 解锁私有数据（前置条件）
3. **TC-15.1 / TC-2.1** → 创建发票（**P0 关键验证**）
4. **TC-4.1 / TC-15.4** → 详情页 v2 字段展示
5. **TC-7.1 / TC-15.2** → 链上同步 v2 字段验证
6. **TC-5.2** → 支付发票
7. **TC-6.1** → 取消发票
8. **TC-11.1 → TC-11.2** → 审计包生成与验证
9. 其余用例
