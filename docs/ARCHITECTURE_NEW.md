# Aleo 隐私发票系统：前端技术架构白皮书

## 1. 前端架构设计 (Architecture Design)

### 1.1 架构设计图

```mermaid
graph TB
    subgraph "前端四层架构"
        View[View Layer<br/>视图层]
        Controller[Controller Layer<br/>控制层]
        Service[Service Layer<br/>服务适配层]
        Model[Model Layer<br/>数据存储层]
    end
    
    View <-->|用户交互<br/>状态展示| Controller
    Controller -->|协调计算<br/>执行操作| Service
    Controller <-->|读取状态<br/>更新数据| Model
    
    style View fill:#e3f2fd
    style Controller fill:#fff3e0
    style Service fill:#f3e5f5
    style Model fill:#e8f5e9
```

### 1.2 架构概述

本系统采用**四层解耦架构**，旨在将隐私数据管理与 UI 渲染完全分离，实现业务逻辑与 Aleo 底层协议的深度解耦。零知识证明（ZKP）的生成由钱包内部处理，应用层通过 `WalletService` 与钱包交互。

---

## 2. 架构层级详细说明

### 2.1 View 层（视图层）

**职责**：负责 UI 渲染、用户交互、以及展示推导后的业务状态。

**核心特性**：
- 纯 React 组件，不处理业务逻辑
- 仅与 Controller 层交互
- 不直接读取 Store，也不直接调用 Aleo SDK

**典型组件**：
- Dashboard 仪表板
- 发票列表卡片
- 创建表单
- 进度条组件

---

### 2.2 Controller 层（逻辑控制层）

**职责**：系统的"指挥中心"。负责接收 View 的指令，协调 Service 进行计算，并根据结果更新 Model。

**核心功能**：

1. **状态推导**：从 Model 获取原始 Record 和 Mapping，推导出业务语义（如 `isPaid`、`canCancel`）
2. **流程控制**：管理异步交易生命周期（Pending → Mining → Confirmed）
3. **异常处理**：捕获 Service 层的底层错误，并转化为用户友好的提示传递给 View

**实现形式**：
- 以 Custom Hooks 形式存在
- 编排发票生命周期（创建 → 支付 → 归档）
- 处理错误弹窗

**交互对象**：
- 向上对接 View
- 向下对接 Service 和 Model

---

### 2.3 Service 层（服务适配层）

**职责**：负责所有"重型"和"底层"操作，是 Aleo 协议的适配器。

**核心功能**：

1. **钱包交互**：封装 `requestRecords`、`requestTransaction`，与钱包进行交互（ZKP 证明由钱包内部生成）
2. **加密算法**：执行发票明细的 AES 加密、Audit Key 的派生、SHA-256 哈希计算
3. **单位转换**：处理 Microcredits 与 Credits 之间的精度转换
4. **RPC 通信**：与 Aleo 节点进行网络通信

**核心服务**：
- 处理 Aleo SDK、WASM 调用
- 实现本地加解密与存储
- 管理本地持久化

**交互对象**：
- 被 Controller 调用
- 不直接操作 Model

---

### 2.4 Model 层（数据存储层）

**职责**：系统的数据源，管理全局状态，充当系统的"单一事实来源"。

**核心组成**：

1. **Zustand Store**：存储从链上同步回来的原始 Record 密文、Mapping 公开状态
2. **IndexedDB (Cache)**：本地持久化存储用户已解密的私密发票详情

**核心状态管理**：
- 维护用户信息
- 管理链上发票索引
- 存储本地解密档案
- 记录交易实时日志

**交互对象**：
- 被 Controller 读取或更新
- 为 Controller 提供推导原始数据

---

## 3. 各模块职责表 (Module Responsibility Matrix)

### 3.1 Controller 层 (Controllers)

| Hook 名 | 职责描述 | 接口定义 |
|---------|---------|---------|
| `useWalletController` | 处理钱包连接、余额轮询及身份授权 | [IWalletController.ts](../controller/Wallet/IWalletController.ts) |
| `useInvoiceController` | 处理发票列表的显示逻辑、解密触发 | [IInvoiceController.ts](../controller/Invoice/IInvoiceController.ts) |
| `useTransactionController` | 管理交易流程（创建/支付/撤销），通过钱包服务处理链上交互 | [ITxController.ts](../controller/Transaction/ITxController.ts) |
| `useAuditController` | 负责隐私数据的打包、签名与导出 | [IAuditController.ts](../controller/Audit/IAuditController.ts) |

### 3.2 Model 层 (Stores)

| Store 名 | 职责 | 接口定义 |
|---------|------|---------|
| `useUserStore` | 用户中心 | [UserState.ts](../stores/User/UserState.ts) |
| `useInvoiceStore` | 索引库 | [InvoiceState.ts](../stores/Invoice/InvoiceState.ts) |
| `useArchiveStore` | 档案库 | [ArchiveState.ts](../stores/Archive/ArchiveState.ts) |
| `useTransactionStore` | 任务站 | [TransactionState.ts](../stores/Transaction/TransactionState.ts) |

### 3.3 Service 层 (底层能力)

| 服务接口 | 职责描述 | 接口定义 | 实现状态 |
|---------|---------|---------|---------|
| **IWalletService** | 连接钱包、获取 ViewKey、获取余额、签名、请求交易 | [IWalletService.ts](../services/WalletService/IWalletService.ts) | ✅ 完全实现 |
| **ICryptoService** | 计算发票哈希、本地加解密、Record 解析、完整性验证 | [ICryptoService.ts](../services/CryptoService/ICryptoService.ts) | ✅ 完全实现 |
| **IStorageService** | IndexedDB 的 CRUD，用于持久化数据 | [IStorageService.ts](../services/StorageService/IStorageService.ts) | ✅ 完全实现 |
| **IAleoProtocolService** | 节点 RPC 交互（广播交易、查询 Mapping、扫描高度） | [IAleoProtocolService.ts](../services/AleoProtocolService/IAleoProtocolService.ts) | ⚠️ 部分实现 |

> **说明**: 零知识证明（ZKP）的生成由 Leo Wallet 内部处理，应用层通过 `WalletService.requestTransaction` 调用钱包功能，钱包会自动生成证明并广播交易。

> ***ICryptoService 说明**:  
> - ✅ 已使用：`computeInvoiceHash` - 发票哈希计算（SHA-256 + 模运算）  
> - ✅ 已使用：`encryptInvoiceDetails` / `decryptInvoiceDetails` - 本地加密存储（PBKDF2 + AES-GCM）  
> - ✅ 已使用：`parseAleoRecord` - Record 数据解析（处理钱包已解密的数据）  
> - ✅ 已使用：`verifyInvoiceIntegrity` - 完整性验证（对比本地哈希与链上哈希）  
>
> **加密存储流程**：  
> v1.0 版本已完全实现加密存储功能。发票创建时，明细通过 `encryptInvoiceDetails` 加密后存入 IndexedDB，查看时通过 `decryptInvoiceDetails` 解密，并通过 `verifyInvoiceIntegrity` 验证数据完整性，确保数据未被篡改。

### 3.4 错误处理系统 (Error Handling System)

#### 3.4.1 架构图

```mermaid
graph TB
    subgraph ErrorFlow["错误处理流程"]
        Service[Service Layer<br/>抛出 ServiceError]
        Controller[Controller Layer<br/>捕获并转换]
        ErrorStore[ErrorStore<br/>状态管理]
        ErrorHandler[ErrorHandler<br/>Toast 展示]
    end
    
    Service -->|WalletServiceError<br/>ProtocolServiceError| Controller
    Controller -->|toAppError| ErrorStore
    ErrorStore -->|currentError| ErrorHandler
    ErrorHandler -->|sonner toast| UI[用户界面]
    
    style Service fill:#f3e5f5
    style Controller fill:#fff3e0
    style ErrorStore fill:#e8f5e9
    style ErrorHandler fill:#e3f2fd
```

#### 3.4.2 核心文件

| 文件 | 职责 | 路径 |
|------|------|------|
| **ServiceError** | Service 层通用错误基类（泛型） | [service-errors.ts](../lib/service-errors.ts) |
| **AppError** | UI 层用户友好错误类型 | [errors.ts](../lib/errors.ts) |
| **ErrorType** | 错误类型枚举（面向用户） | [errors.ts](../lib/errors.ts) |
| **toAppError** | 错误转换器（ServiceError → AppError） | [errors.ts](../lib/errors.ts) |
| **useErrorStore** | 错误状态管理 | [useErrorStore.ts](../stores/Error/useErrorStore.ts) |
| **useErrorHandler** | 错误处理 Controller | [useErrorHandler.ts](../controller/Error/useErrorHandler.ts) |
| **ErrorHandler** | 错误展示组件（Toast 触发） | [error-handler.tsx](../components/error-handler.tsx) |

#### 3.4.3 错误类型层级

```
┌─────────────────────────────────────────────────────────┐
│  Service Layer (技术错误)                                │
│  ├─ WalletServiceError<WalletError>                     │
│  │   ├─ NOT_INSTALLED                                   │
│  │   ├─ USER_REJECTED                                   │
│  │   ├─ INSUFFICIENT_FEE                                │
│  │   ├─ NETWORK_MISMATCH                                │
│  │   ├─ UNAUTHORIZED                                    │
│  │   └─ DECRYPTION_FAILED                               │
│  └─ ProtocolServiceError<ProtocolError>                 │
│      ├─ NODE_CONNECTION_FAILED                          │
│      ├─ INVALID_RECORD                                  │
│      ├─ TRANSACTION_REJECTED                            │
│      ├─ SYNC_TIMEOUT                                    │
│      └─ MAPPING_NOT_FOUND                               │
└─────────────────────────────────────────────────────────┘
                         ↓ toAppError()
┌─────────────────────────────────────────────────────────┐
│  UI Layer (用户友好错误)                                 │
│  AppError<ErrorType>                                    │
│  ├─ WALLET_NOT_CONNECTED     → "钱包未连接"              │
│  ├─ WALLET_CONNECTION_FAILED → "钱包连接失败"            │
│  ├─ TRANSACTION_REJECTED     → "交易已拒绝"              │
│  ├─ INSUFFICIENT_BALANCE     → "余额不足"                │
│  ├─ NETWORK_ERROR            → "网络错误"                │
│  └─ ...                                                 │
└─────────────────────────────────────────────────────────┘
```

#### 3.4.4 使用示例

```typescript
// Controller 层使用错误处理
const { handleError } = useErrorHandler();

const handleConnect = async () => {
  try {
    await walletService.connect();
    // 成功逻辑...
  } catch (error) {
    // 自动转换为用户友好提示并显示 Toast
    handleError(error);
  }
};
```

---

## 4. 关键业务的时序逻辑 (Sequence Diagrams)

### 4.1 连接钱包 (Connect Wallet)

```mermaid
sequenceDiagram
    autonumber
    participant V as View (Connect Button)
    participant C as Controller (useWalletController)
    participant A as Adapter (createWalletAdapter)
    participant WC as WalletContext (useWallet Hook)
    participant S as Store (UserStore)
    participant WS as WalletService
    participant PS as AleoProtocolService (Node RPC)
    
    V->>C: 点击 "Connect Wallet"
    activate C
    C->>C: setIsConnecting(true)
    C->>WS: connect()
    activate WS
    
    Note over WS,A: WalletService 通过适配器桥接
    WS->>A: connect()
    activate A
    A->>A: 检查钱包是否可用
    A->>A: 如果未选择钱包，选择第一个可用钱包
    A->>WC: connect(DecryptPermission, network, programs)
    activate WC
    Note over WC: Leo Wallet 弹出连接确认窗口
    WC-->>A: Promise resolved (连接成功)
    deactivate WC
    A-->>WS: 连接成功
    deactivate A
    WS-->>C: connect() 完成
    deactivate WS
    C->>C: setIsConnecting(false)
    
    Note over C: React useEffect 监听 wallet 状态变化
    WC->>C: wallet.publicKey 和 wallet.connected 更新
    C->>C: useEffect 检测到状态变化
    C->>S: setAccount(publicKey, connected)
    activate S
    S-->>C: Store 已更新
    deactivate S
    
    Note over C: 另一个 useEffect 检测到 publicKey 和 connected
    C->>C: syncBalances() 触发
    
    par 并行获取余额
        C->>WS: getPrivateBalance(publicKey)
        activate WS
        Note over WS: 通过 requestRecords('credits.aleo')<br/>计算未花费 Records 总和
        WS-->>C: 返回 private Microcredits
        deactivate WS
        C->>PS: getPublicBalance(publicKey)
        activate PS
        Note over PS: 查询链上 Mapping<br/>credits.aleo/account/{address}
        PS-->>C: 返回 public Microcredits
        deactivate PS
    end
    
    C->>S: updateBalances(publicBalance, privateBalance)
    activate S
    S-->>C: 余额已更新
    deactivate S
    
    Note over C,V: Store 状态变更触发 UI 重新渲染
    S->>V: 状态更新
    V->>V: 显示已连接状态<br/>显示地址和余额
    deactivate C
    
    Note over C: 定期同步余额（每 30 秒）
    loop 每 30 秒
        C->>C: syncBalances()
    end
```

### 4.2 开票 (Issue Invoice)

```mermaid
sequenceDiagram
    autonumber
    participant V as View (Create Invoice Form)
    participant C as Controller (useTransactionController)
    participant S as Store (User/Invoice Store)
    participant CS as CryptoService (ICryptoService)
    participant WS as WalletService (IWalletService)
    participant SS as StorageService (IStorageService)
    
    Note over V,SS: --- 阶段 1: 权限检查与数据准备 ---
    
    V->>C: 提交发票表单 (InvoiceDetails)
    activate C
    
    Note over C,WS: 按需触发身份授权
    alt MasterKey 不存在 (UserStore 为空)
        C->>S: updateProgress(0, 'AUTHORIZING')
        C->>WS: signMessage("Sign to access your private invoices")
        WS-->>C: 返回 Signature 
        C->>CS: deriveMasterKey(Signature)
        CS-->>C: 返回 masterKey
        C->>S: setMasterKey(masterKey)
    end

    C->>S: startTx('HASHING')
    
    C->>CS: computeInvoiceHash(invoiceData)
    Note right of CS: 使用详情数据生成唯一 Hash (Field)
    CS-->>C: 返回 invoice_hash [cite: 5, 12, 13]
    
    C->>S: updateProgress(10, 'PREPARING')
    
    Note over C,WS: --- 阶段 2: 提交交易请求 (异步任务提交) ---
    
    C->>S: startTx('REQUESTING')
    C->>S: updateProgress(20, 'REQUESTING')
    
    C->>WS: requestTransaction(create_invoice, params)
    Note right of WS: 钱包在后台生成证明并准备广播 [cite: 7, 8, 16]
    WS-->>C: 返回 requestId (UUID)
    
    Note over C,SS: --- 阶段 3: 本地加密归档与即时跳转 ---
    
    C->>S: startTx('ARCHIVING')
    C->>S: updateProgress(90, 'ARCHIVING')
    
    C->>CS: encryptInvoiceDetails(invoiceDetails, masterKey)
    Note right of CS: 使用随机 IV + AES-GCM 进行对称加密
    CS-->>C: 返回 EncryptedPayload (iv + ciphertext)
    
    C->>SS: saveEncryptedInvoice(invoice_hash, encryptedPayload)
    Note right of SS: 初始状态设为 'SENDING'，存入 IndexedDB [cite: 13, 14, 15]
    SS-->>C: 存储确认
    
    C->>S: InvoiceStore.addInvoice(newInvoice)
    Note right of S: 更新内存状态，UI 自动同步
    
    C->>V: 自动跳转至发票详情页 /invoice/:hash
    deactivate C
```

### 4.3 查看发票(View Invoice)

#### 4.3.1 查看发票详情页
```mermaid
sequenceDiagram
    autonumber
    participant V as View (Invoice Detail Page)
    participant UI as useInvoiceInitialize
    participant UD as useInvoiceDetail
    participant S as Store (InvoiceStore / UserStore)
    participant DB as IndexedDB (Storage)
    participant CS as CryptoService
    participant WS as WalletService

    Note over V,S: --- 场景 A: 初始化加载 (冷启动) ---
    
    V->>UI: 页面加载 (useInvoiceInitialize)
    UI->>S: 检查 masterKey 是否存在
    
    alt MasterKey 不存在
        UI->>S: setInitStatus('AUTH_REQUIRED')
        V->>V: 显示 "解锁隐私数据" 遮罩
        V->>UI: handleUnlock()
        UI->>WS: signMessage("Authorize Access")
        WS-->>UI: 返回 Signature
        UI->>CS: deriveMasterKey(Signature)
        CS-->>UI: 返回 masterKey
        UI->>S: setMasterKey(masterKey)
    end

    Note over V,WS: --- 场景 B & C: 查看详情与 Record 自动对账 ---
    
    V->>V: 识别当前 URL 中的 /invoices/:hash
    V->>UD: useInvoiceDetail(invoiceHash)
    UD->>S: getInvoiceByHash(hash)
    S-->>UD: 返回 Invoice 对象 (可能 status: 'SENDING')
    UD->>V: 立即渲染本地数据 (避免白屏)

    alt 发票状态不是 "CONFIRMED"
        Note over UD,WS: 开始基于 Record 的自动对账轮询
        UD->>V: UI 显示 "正在同步链上记录..." (isSyncing=true)
        
        UD->>UD: startPolling() (立即执行一次 + 每15s轮询)
        
        loop 轮询扫描 (每 15s)
            UD->>WS: requestRecords("zk_invoice.aleo")
            Note right of WS: 钱包自动使用 ViewKey 解密
            WS-->>UD: 返回解密后的 Record 列表
            
            loop 遍历所有 Records
                UD->>CS: parseAleoRecord(record)
                CS-->>UD: 返回 parsedRecord
                UD->>UD: 清理 invoice_hash: replace(/field\.(private|public)$/, 'field')
                
                alt Record.invoice_hash === invoiceHash (匹配)
                    UD->>UD: 找到匹配的 Record
                end
            end
            
            alt 发现匹配 Record (Found)
                UD->>CS: cleanAleoNumber() (清理数字字段类型后缀)
                UD->>S: setConfirmationStatus(hash, 'CONFIRMED')
                UD->>S: updateInvoice(invoice.id, updatedInvoice)
                
                Note over UD,DB: 同步更新本地持久化存档
                UD->>CS: encryptInvoiceDetails(details, masterKey)
                CS-->>UD: 返回 EncryptedPayload
                UD->>DB: saveEncryptedInvoice(hash, payload)
                
                UD->>V: UI 状态切换为 "已确认 (Found on Chain)"
                UD->>UD: stopPolling() (停止轮询)
            else 尚未发现或同步中
                Note right of UD: 继续等待，15s后重试
            end
        end
    else 状态已经是 "CONFIRMED"
        UD->>V: UI 直接显示 "已确认" 勋章
    end

    Note over V,UD: --- 手动同步状态 ---
    
    V->>UD: 用户点击 "Sync Status" 按钮
    UD->>UD: handleSyncStatus()
    UD->>WS: requestRecords("zk_invoice.aleo")
    WS-->>UD: 返回最新 Record 列表
    UD->>UD: 查找匹配的 InvoiceRecord 或 PaymentRecord
    alt 找到 PaymentRecord
        UD->>S: updateInvoice(..., { status: PAID })
    else 找到 InvoiceRecord
        UD->>S: updateInvoice(..., { status: record.status })
    end
    UD->>DB: 同步更新 IndexedDB
    UD->>V: 显示同步成功提示
```

#### 4.3.2 发票列表页查看
```mermaid
sequenceDiagram
    autonumber
    participant V as View (Invoice List Page)
    participant C as useInvoices
    participant CI as useInvoiceInitialize (内部)
    participant S as Store (InvoiceStore / UserStore)
    participant DB as IndexedDB (Storage)
    participant CS as CryptoService
    participant WS as WalletService

    Note over V,S: --- 场景 A: 初始化加载 (冷启动) ---
    
    V->>C: 进入列表页 (useInvoices)
    C->>CI: 调用 useInvoiceInitialize()
    CI->>S: 检查 masterKey 是否存在
    
    alt masterKey 不存在
        CI->>S: setInitStatus('AUTH_REQUIRED')
        CI-->>C: 返回 isAuthRequired=true
        C-->>V: 返回 showAuthModal=true
        V->>V: 显示 "解锁隐私数据" 遮罩
        V->>C: handleUnlock()
        C->>CI: handleUnlock()
        CI->>WS: signMessage("Authorize Access")
        WS-->>CI: 返回 Signature
        CI->>CS: deriveMasterKey(Signature)
        CS-->>CI: 返回 masterKey
        CI->>S: setMasterKey(masterKey)
    end

    CI->>S: setInitStatus('LOADING_DB')
    
    Note over CI,WS: --- 步骤 1: 从链上扫描所有 Records ---
    CI->>CI: syncInvoices(masterKey)
    CI->>WS: requestRecords("zk_invoice.aleo")
    WS-->>CI: 返回所有 Records
    CI->>CS: parseAleoRecord() (批量解析)
    CS-->>CI: 返回 Map<invoiceHash, AleoInvoiceRecord>
    
    Note over CI,DB: --- 步骤 2: 从 IndexedDB 加载加密明细 ---
    CI->>DB: getAllEncryptedInvoices()
    DB-->>CI: 返回 EncryptedPayload[] (invoiceHash, payload)
    
    loop 批量解密每个发票明细
        CI->>CS: decryptInvoiceDetails(payload, masterKey)
        CS-->>CI: 返回明文 InvoiceDetails
        CI->>CS: computeInvoiceHash(details) (验证完整性)
        alt 哈希匹配
            CI->>CI: 保存到 detailsMap
        else 哈希不匹配
            Note right of CI: 警告：数据可能被篡改，跳过
        end
    end
    
    Note over CI,S: --- 步骤 3: 合并链上数据和本地明细 ---
    loop 遍历链上所有 Records
        CI->>CS: cleanAleoNumber() (清理数字字段类型后缀)
        CI->>CI: 从 detailsMap 获取对应的本地明细
        CI->>CI: 构建完整 Invoice 对象<br/>(链上基本信息 + 本地明细)
        CI->>S: addInvoice(invoice)
        CI->>S: setConfirmationStatus(hash, 'CONFIRMED')
    end
    
    CI->>S: setInitStatus('READY')
    Note right of S: Store 已填满，包含所有链上发票
    
    C->>S: 订阅 invoices 状态
    S-->>C: 返回发票列表
    C->>C: 根据 publicKey 判断角色 (SELLER/BUYER/BOTH)
    C->>C: 应用过滤和搜索逻辑
    C-->>V: 返回 filteredInvoices (已处理角色和过滤)
    V->>V: 渲染发票卡片列表
    
    Note over V,S: --- 场景 B: 列表交互 (过滤/搜索/刷新) ---
    
    V->>V: 用户切换过滤标签 (All/Pending/Paid/Cancelled)
    V->>C: setFilter(filter)
    C->>C: 应用状态过滤逻辑
    C-->>V: 返回更新后的 filteredInvoices
    
    V->>V: 用户输入搜索关键词
    V->>C: setSearch(keyword)
    C->>C: 应用搜索过滤逻辑 (ID/hash/buyer/seller)
    C-->>V: 返回更新后的 filteredInvoices
    V->>V: 更新显示列表
    
    Note over V,S: --- 场景 C: 同步所有发票状态 ---
    
    V->>V: 用户点击 "Sync All" 按钮
    V->>C: handleSyncAll()
    C->>WS: requestRecords("zk_invoice.aleo")
    WS-->>C: 返回最新 Record 列表
    C->>CS: parseAleoRecord() (解析所有 Records)
    
    loop 遍历每个本地发票
        C->>C: 查找对应的链上 Record (InvoiceRecord 或 PaymentRecord)
        alt 找到 PaymentRecord
            C->>S: updateInvoice(..., { status: PAID })
        else 找到 InvoiceRecord
            C->>S: updateInvoice(..., { status: record.status })
        end
        C->>S: setConfirmationStatus(hash, 'CONFIRMED')
        C->>DB: 同步更新 IndexedDB
    end
    
    C->>V: 显示同步成功提示
    S-->>C: 触发重新计算 filteredInvoices
    C-->>V: 返回更新后的 filteredInvoices
    V->>V: 触发重新渲染
    
    Note over V,S: --- 场景 D: 跳转到详情页 ---
    
    V->>V: 用户点击某条发票卡片
    V->>V: 路由跳转到 /invoices/:hash
    Note right of V: 详情页将使用 useInvoiceDetail Hook<br/>进行链上 Record 自动对账
```

### 4.4 支付发票 (Pay Invoice)

```mermaid
sequenceDiagram
    autonumber
    participant V as View (InvoiceCard / Invoice Detail)
    participant CID as useInvoiceDetail / useInvoices
    participant TC as useTransactionController
    participant TS as TransactionStore
    participant WS as WalletService
    participant CS as CryptoService
    participant BC as Blockchain
    
    V->>CID: 点击 "Pay" 按钮 (invoice.id)
    CID->>CID: handlePay(invoice.id)
    CID->>V: Toast: "Processing payment..."
    
    CID->>TC: executePay(invoiceId)
    
    Note over TC,TS: --- 阶段 1: 权限检查与准备 ---
    TC->>TC: 检查 publicKey 和 walletService
    TC->>TS: startTx('REQUESTING')
    TC->>TS: updateProgress(10, 'Fetching invoice record from chain...')
    
    Note over TC,BC: --- 阶段 2: 从链上获取 InvoiceRecord ---
    TC->>WS: requestRecords("zk_invoice.aleo")
    WS-->>TC: 返回所有 Records 列表
    
    loop 遍历所有 Records
        TC->>CS: parseAleoRecord(record)
        CS-->>TC: 返回 parsedRecord
        TC->>TC: 清理 invoice_id: replace(/field\.(private|public)$/, 'field')
        
        alt parsedRecord.invoice_id === invoiceId (匹配)
            TC->>TC: 找到匹配的 InvoiceRecord
        end
    end
    
    alt InvoiceRecord 未找到
        TC-->>CID: 抛出错误: "Invoice record not found on chain"
        CID->>V: Toast: "Payment failed"
    else InvoiceRecord 找到
        TC->>TS: updateProgress(30, 'Invoice record found. Preparing payment...')
        
        Note over TC,CS: --- 阶段 3: 生成 payment_nonce ---
        TC->>CS: computeInvoiceHash({ invoiceNumber: "PAYMENT-..." })
        CS-->>TC: 返回 paymentNonce
        
        TC->>TS: updateProgress(50, 'Submitting payment transaction...')
        
        Note over TC,BC: --- 阶段 4: 调用 mark_as_paid transition ---
        TC->>WS: requestTransaction({<br/>  functionName: 'mark_as_paid',<br/>  inputs: [invoiceRecord, paymentNonce],<br/>  programId: 'zk_invoice.aleo',<br/>  fee: 1000000<br/>})
        WS-->>BC: 广播交易 (钱包后台生成证明)
        BC-->>WS: 返回 requestId (UUID)
        WS-->>TC: 返回 requestId
        
        TC->>TS: updateProgress(90, 'Payment transaction submitted successfully')
        TC->>TS: updateProgress(100, '✓ Payment completed!')
        TC->>TS: completeTx()
        
        TC-->>CID: 返回 transactionId (requestId)
        CID->>V: Toast: "Payment successful!" + transactionId
        
        Note over CID: --- 阶段 5: 同步状态更新 ---
        alt 在详情页
            CID->>CID: handleSyncStatus() (自动同步最新状态)
        else 在列表页
            CID->>CID: refresh() (重新初始化列表)
        end
    end
```
### 4.5 取消发票 (Cancel Invoice)

```mermaid
sequenceDiagram
    autonumber
    participant V as View (InvoiceCard / Invoice Detail)
    participant CID as useInvoiceDetail / useInvoices
    participant TC as useTransactionController
    participant TS as TransactionStore
    participant WS as WalletService
    participant CS as CryptoService
    participant BC as Blockchain
    
    V->>CID: 点击 "Cancel" 按钮 (invoice.id)
    CID->>CID: handleCancel(invoice.id)
    CID->>V: Toast: "Cancelling invoice..."
    
    CID->>TC: executeCancel(invoiceId)
    
    Note over TC,TS: --- 阶段 1: 权限检查与准备 ---
    TC->>TC: 检查 publicKey 和 walletService
    TC->>TS: startTx('REQUESTING')
    TC->>TS: updateProgress(10, 'Fetching invoice record from chain...')
    
    Note over TC,BC: --- 阶段 2: 从链上获取 InvoiceRecord ---
    TC->>WS: requestRecords("zk_invoice.aleo")
    WS-->>TC: 返回所有 Records 列表
    
    loop 遍历所有 Records
        TC->>CS: parseAleoRecord(record)
        CS-->>TC: 返回 parsedRecord
        TC->>TC: 清理 invoice_id: replace(/field\.(private|public)$/, 'field')
        
        alt parsedRecord.invoice_id === invoiceId (匹配)
            TC->>TC: 找到匹配的 InvoiceRecord
        end
    end
    
    alt InvoiceRecord 未找到
        TC-->>CID: 抛出错误: "Invoice record not found on chain"
        CID->>V: Toast: "Failed to cancel invoice"
    else InvoiceRecord 找到
        TC->>TS: updateProgress(40, 'Invoice record found. Preparing cancellation...')
        
        Note over TC,BC: --- 阶段 3: 调用 cancel_invoice transition ---
        TC->>WS: requestTransaction({<br/>  functionName: 'cancel_invoice',<br/>  inputs: [invoiceRecord],<br/>  programId: 'zk_invoice.aleo',<br/>  fee: 1000000<br/>})
        WS-->>BC: 广播交易 (钱包后台生成证明)
        BC-->>WS: 返回 requestId (UUID)
        WS-->>TC: 返回 requestId
        
        TC->>TS: updateProgress(90, 'Cancellation transaction submitted successfully')
        TC->>TS: updateProgress(100, '✓ Invoice cancelled!')
        TC->>TS: completeTx()
        
        TC-->>CID: 返回 transactionId (requestId)
        CID->>V: Toast: "Invoice cancelled successfully" + transactionId
        
        Note over CID: --- 阶段 4: 同步状态更新 ---
        alt 在详情页
            CID->>CID: handleSyncStatus() (自动同步最新状态)
        else 在列表页
            CID->>CID: refresh() (重新初始化列表)
        end
    end
```

### 4.6 审计导出 (Audit Export)

```mermaid
sequenceDiagram
    autonumber
    participant V as View (Audit Center)
    participant C as Controller (useAuditController)
    participant S as Store (Archive Store)
    participant WS as WalletService
    participant SS as StorageService
    V->>C: 选择多张发票并点击 "Export Audit Package"
    
    C->>SS: 批量获取解密明细 (InvoiceDetails)
    C->>WS: signMessage(AuditMetadataHash)
    WS-->>C: 返回身份签名 (Signature)
    
    rect rgb(232, 245, 233)
    Note over C: 构建 AuditKey 对象
    Note over C: 包含：发票ID列表、明细数据、身份签名、过期时间
    end
    C->>V: 生成 .json 文件供用户下载
    V->>V: 用户将文件发送给审计师 (Auditor)
```



---

## 5. 架构设计原则

### 5.1 解耦原则

- **View 层**不直接调用底层 Service，业务逻辑通过 Service 层封装
- **View 层**通过 Service 层与钱包交互，不直接访问 `window.leoWallet`
- **Service 层**专注于业务逻辑封装，不包含 UI 相关代码
- **Store 层**负责状态管理，不直接调用钱包或区块链 API

### 5.2 持久化原则（当前实现）

> **v1.0 策略**: 采用 IndexedDB + 加密存储的完整方案

- **存储方案**：使用 `IndexedDB` 存储加密后的发票明细
- **加密方案**：所有敏感数据通过 `CryptoService` 加密后存储
  - 使用 PBKDF2 (100,000 次迭代) 派生用户密钥
  - AES-GCM 对称加密保护数据隐私
- **完整性验证**：通过 `verifyInvoiceIntegrity` 确保数据未被篡改
- **设计优势**：
  - ✅ 数据持久化加密保护
  - ✅ 支持离线访问
  - ✅ 大容量存储（~50MB+）
  - ✅ 可审计的访问记录
  - ✅ 防篡改机制

### 5.3 单一职责原则

- 每一层只负责其核心职责
- Controller 作为唯一的协调者，不包含具体的业务计算逻辑
- Service 层封装所有底层实现细节

### 5.4 错误处理原则

- **Service 层**抛出技术性错误（`WalletServiceError`、`ProtocolServiceError`）
- **Controller 层**使用 `useErrorHandler` 捕获并转换错误
- **View 层**通过 `ErrorHandler` 组件自动展示 Toast
- 错误类型分层：技术错误（Service）→ 用户友好错误（UI）
- 使用泛型基类 `ServiceError<T>` 消除重复代码

---

## 6. 实现状态与版本规划

### 6.1 当前实现状态 (v1.0)

#### ✅ 已完成功能

| 功能模块 | 实现状态 | 技术方案 |
|---------|---------|---------|
| **钱包连接** | ✅ 完全实现 | Leo Wallet 适配器 |
| **发票创建** | ✅ 完全实现 | 直接调用钱包 `requestTransaction` |
| **发票支付** | ✅ 完全实现 | 两步流程：转账 + 标记已支付 |
| **发票取消** | ✅ 完全实现 | 调用合约 `cancel_invoice` |
| **余额查询** | ✅ 完全实现 | 私有余额 + 公开余额 |
| **哈希计算** | ✅ 完全实现 | SHA-256 + 模运算（Field 范围） |
| **数据存储** | ✅ 完全实现 | IndexedDB + 加密存储 |
| **数据加密** | ✅ 完全实现 | PBKDF2 + AES-GCM |
| **完整性验证** | ✅ 完全实现 | verifyInvoiceIntegrity |
| **审计密钥** | ✅ 基础实现 | SHA-256 哈希生成 |
| **错误处理** | ✅ 完全实现 | ServiceError + AppError 分层 |

#### ⚠️ 部分实现功能

| 功能模块 | 当前状态 | 缺失部分 | 计划版本 |
|---------|---------|---------|---------|
| **审计导出** | ⚠️ 基础功能 | 钱包签名、文件导出 | v2.0 |
| **Record 解密** | ⚠️ 简化实现 | 依赖钱包自动解密 | - |
| **交易监控** | ⚠️ 基础实现 | 实时进度反馈 | v2.0 |

### 6.2 技术架构决策

#### 决策 1: 钱包处理 ZKP 生成

**原因**:
- Leo Wallet 的 `requestTransaction` 已内置零知识证明生成
- 无需应用层重复实现，减少代码复杂度
- 钱包可以更好地管理证明生成过程和性能优化

**实现**:
- 应用层通过 `WalletService.requestTransaction` 调用钱包功能
- 钱包自动生成证明并广播交易
- 应用层只关注业务逻辑，不处理底层证明生成

**影响**:
- ✅ 简化了架构（无需独立的 ZKProofService）
- ✅ 提高了开发效率
- ✅ 减少了维护成本
- ⚠️ 依赖钱包实现（但这是必然的，符合 Aleo 生态最佳实践）

#### 决策 2: v1.0 使用 IndexedDB + 加密存储

**原因**:
- 生产环境需要数据安全保护
- 支持大容量存储需求
- 提供完整性验证机制
- 符合隐私保护最佳实践

**影响**:
- ✅ 数据安全性高
- ✅ 支持离线访问
- ✅ 防篡改保护
- ✅ 可审计追踪
- ⚠️ 需要密钥管理（通过 PBKDF2 派生）

#### 决策 3: 完整的验证流程

**原因**:
- 确保本地数据与链上存证一致
- 防止数据被恶意篡改
- 提供用户信任保障

**实现**:
- ✅ `computeInvoiceHash` 计算哈希
- ✅ `verifyInvoiceIntegrity` 验证完整性
- ✅ 链上存证 + 本地加密存储双重保护

### 6.3 版本规划

#### v1.0 (当前版本)
- ✅ 核心业务流程完整
- ✅ IndexedDB + 加密存储
- ✅ 完整性验证机制
- ✅ 钱包集成完整
- ✅ 生产环境就绪

#### v2.0 (规划中)
- 🎯 完善审计导出（钱包签名、JSON/PDF 导出）
- 🎯 实时交易进度反馈
- 🎯 增强的密钥管理（用户特定盐值）
- 🎯 批量操作优化

#### v3.0 (远期规划)
- 🔮 多钱包支持
- 🔮 批量操作
- 🔮 高级审计功能
- 🔮 数据同步和备份

---

## 7. 架构演进与重构

### 7.1 Store 层与 IndexedDB 交互优化（v1.1）

**重构目标**：简化数据同步逻辑，将持久化责任统一到 Store 层。

**改进内容**：
- ✅ Store 层新增 `syncAllFromChain` 方法，统一管理批量同步逻辑
- ✅ Controller 层简化，`handleSyncAll` 直接调用 Store 方法
- ✅ 消除 Controller 层对 IndexedDB 的直接操作
- ✅ 统一数据流向：Controller → Store → IndexedDB

**架构对比**：

**重构前：**
```
UI → Controller → [Store + IndexedDB 手动同步]
                  ↑
                  需要多处维护同步逻辑
```

**重构后：**
```
UI → Controller → Store → [IndexedDB 自动持久化]
                        ↑
                        统一在 Store 内管理
```

### 7.2 列表页重构（v1.1）

**重构目标**：统一列表页与详情页的架构模式，提升代码一致性。

**改进内容**：
- ✅ 将 `getStatusConfig` 移到 Controller 层，UI 层只负责展示
- ✅ 列表页添加链上确认状态显示（与详情页一致）
- ✅ 统一状态判断逻辑，简化条件渲染
- ✅ Controller 返回完整的状态配置，UI 层无需计算

**架构优势**：
- 📦 代码复用：`getStatusConfig` 可在多个页面复用
- 🎯 职责清晰：UI 层纯展示，Controller 层处理业务逻辑
- 🔄 一致性：列表页与详情页使用相同的架构模式
- 🐛 易于维护：状态展示逻辑集中管理

### 7.3 Store 层完整发票持久化（v1.2）

**重构目标**：Store 层统一管理完整发票持久化，修复新创建发票的显示问题。

**核心改进**：
- ✅ **完整发票持久化**：Store 操作自动同步基本信息和 details 到 IndexedDB
- ✅ **数据分离策略**：
  - 基本信息（id, seller, buyer 等）：持久化到 IndexedDB（未确认时必需）
  - 加密明细（details）：持久化到 IndexedDB（加密存储）
  - 确认状态（confirmationStatus）：仅内存状态，不持久化
- ✅ **回退加载机制**：`getInvoiceByHash` 支持从 IndexedDB 回退加载完整发票
- ✅ **保留未确认发票**：`clearInvoices` 保留 SENDING 状态的发票，避免丢失
- ✅ **初始化优化**：从 IndexedDB 恢复所有发票（包括未确认的）

**数据持久化策略**：

| 数据类型 | 是否持久化 | 存储位置 | 原因 |
|---------|----------|---------|------|
| **基本信息** (id, seller, buyer, amount) | ✅ 是 | IndexedDB | 未确认发票的唯一数据源 |
| **加密明细** (details) | ✅ 是 | IndexedDB | 敏感数据，需要加密保护 |
| **确认状态** (confirmationStatus) | ❌ 否 | 内存 | 运行时状态，从链上获取 |
| **链上数据** | ❌ 否 | 链上 | 已确认发票从链上获取更可靠 |

**修复的问题**：
- 🐛 **Not Found Bug**：新创建发票跳转详情页时显示 "Not Found"
  - 原因：`clearInvoices()` 清空了未确认发票，且 `getInvoiceByHash` 不支持回退加载
  - 解决：保留 SENDING 发票 + 支持 IndexedDB 回退加载

**架构对比**：

**重构前：**
```
创建发票 → Store (内存) → IndexedDB (仅 details)
                ↓
          syncInvoices() 执行
                ↓
        clearInvoices() 清空所有
                ↓
        只加载链上已确认的
                ↓
        新发票丢失 → Not Found ❌
```

**重构后：**
```
创建发票 → Store (内存) → IndexedDB (完整发票)
                ↓
          syncInvoices() 执行
                ↓
        clearInvoices({ keepSending: true })
                ↓
        保留 SENDING + 加载链上 + 恢复 IndexedDB
                ↓
        完整发票列表 ✅
```

**技术实现**：
- `addInvoice`: 自动持久化完整发票（basicInfo + encryptedDetails）
- `updateInvoice`: 同步更新 IndexedDB
- `getInvoiceByHash`: 支持从 IndexedDB 回退加载
- `clearInvoices`: 保留 SENDING 状态的发票
- `syncInvoices`: 合并链上数据 + IndexedDB 数据

---

## 8. 版本信息

- **文档版本**: v1.5
- **代码版本**: v1.2
- **最后更新**: 2026-01-13
- **更新内容**: 
  - ✅ v1.2: Store 层完整发票持久化（基本信息 + details）
  - ✅ v1.2: 修复 "Not Found" Bug - 支持从 IndexedDB 回退加载
  - ✅ v1.2: `clearInvoices` 保留 SENDING 状态的发票
  - ✅ v1.2: `syncInvoices` 从 IndexedDB 恢复未确认发票
  - ✅ v1.1: Store 层统一管理 IndexedDB 同步（`syncAllFromChain`）
  - ✅ v1.1: 列表页重构，统一架构模式，添加链上确认状态显示
  - ✅ v1.1: Controller 层简化，`getStatusConfig` 移到业务逻辑层
  - ✅ v1.0: 更新数据存储策略：使用 IndexedDB + 加密存储
  - ✅ v1.0: 添加发票验证流程（完整性验证）
  - ✅ v1.0: 更新开票流程时序图（包含加密归档）
- **维护团队**: Aleo Privacy Invoice System Team