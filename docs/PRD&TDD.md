ZK-Invoice
隐私发票系统产品需求文档
Aleo Buildathon | Version 1.0 | 2025-01-04
1. 产品概述
1.1 产品定位
ZK-Invoice 是基于 Aleo 区块链的隐私 B2B 发票与支付系统，利用零知识证明技术实现「交易隐私 + 合规审计」的平衡。
1.2 解决的核心痛点
痛点
ZK-Invoice 解决方案
跨境慢 & 手续费高
链上隐私转账，秒级到账，手续费 < $0.10
商业情报泄露
交易金额、供应商、采购量全程加密，链上仅存证明
对账繁琐
支付即对账，ZK证明自动生成加密收据
隐私 vs 合规矛盾
View Key / Audit Key 选择性披露，满足监管要求

1.3 目标用户
跨境 B2B 企业：需要保护供应链商业机密的制造/贸易企业
数据服务商：AI 数据标注、云服务等需要隐私结算的服务提供方
财务 & 审计：需要合规审计能力但又要保护日常交易隐私的企业财务部门

2. Aleo 技术栈适配
2.1 核心技术特性映射
Aleo 特性
技术说明
ZK-Invoice 应用
Record 模型
私密状态存储，类 UTXO，链上密文
InvoiceRecord 存储发票详情
Mapping
公开状态存储，键值对
发票哈希索引、支付状态
View Key
Account View Key 解密账户所有记录
Audit Key 审计披露
Transaction View Key
单笔交易解密密钥，哈希上链
单张发票选择性披露
Async/Future
链下证明生成 + 链上异步执行
支付状态更新、对账自动化

2.2 稳定币依赖说明
USDCx 状态（截至 2025-01-04）：
2024年12月9日在 Aleo Testnet 上线
由 Circle xReserve 提供支持，1:1 锚定 USDC
主网预计 2026 年 1 月底上线
支持隐私交易，同时保留 compliance record 供合规审查
MVP 策略：优先使用 Aleo 原生 credits.aleo 进行隐私转账演示；USDCx 上主网后切换为正式支付货币。

3. 三阶段产品流程
3.1 第一阶段：开票与存证
角色：卖家（收款方）
目标：生成加密发票，链上存证哈希，安全传输给买家
流程步骤：
发票数据输入：卖家在 UI 填写项目明细、单价、总额、买家地址
本地加密：前端使用买家公钥加密发票详情，生成 encrypted_invoice
哈希计算：计算 invoice_hash = Hash(encrypted_invoice)
链上存证：调用 Leo 合约 create_invoice()，将 invoice_hash 存入 Mapping，生成 InvoiceRecord
传输给买家：将 [encrypted_invoice + TxID + invoice_hash] 打包发送给买家
产出：
InvoiceRecord（私密，卖家持有）
invoice_hash 上链（公开但无意义的哈希）
加密发票数据包（买家可解密）
3.2 第二阶段：验证与支付
角色：买家（付款方）
目标：验证发票真实性，执行隐私支付，获取 ZK 收据
流程步骤：
解密发票：买家用私钥解密 encrypted_invoice，查看发票详情
链上验证：根据 TxID 查询链上 invoice_hash，与本地计算结果对比，确认一致
确认支付：买家审核无误后，调用 pay_invoice() 执行 transfer_private 隐私转账
状态更新：合约异步更新 invoice_status Mapping 为 PAID
生成收据：合约自动生成 PaymentRecord（ZK 证明），双方各持有一份
产出：
PaymentRecord（私密，买卖双方各持有）
invoice_status = PAID（公开状态）
资金完成隐私转移
3.3 第三阶段：归档与审计
角色：买卖双方财务 / 外部审计师
目标：生成合规凭证，支持选择性披露审计
流程步骤：
生成索引钥匙：计算 index_key = Hash(invoice_data + payment_proof)
打包加密凭证：将 [发票详情 + 支付收据 + 链上证据指纹] 合并为加密记账凭证
链下存储：凭证存入双方各自的私有数据库，可对接 ERP 系统
审计披露：企业生成 Audit Key（View Key 子集），授权审计师查看特定发票
合规查看：审计师用 Audit Key 解密指定凭证，链上验证真实性
产出：
加密记账凭证（链下私有）
Audit Key（可分发给审计方）
合规审计报告

4. 技术架构
4.1 系统架构图
[前端 Next.js + Vercel] ←→ [Aleo Wallet Adapter] ←→ [Aleo Network]
                                    ↓
                          [Leo Smart Contracts]
                                    ↓
                    [Records + Mappings on Aleo]
4.2 技术栈
层级
技术
说明
Frontend
Next.js 14 + TypeScript
App Router, Server Components
Styling
Tailwind CSS + shadcn/ui
快速原型开发
Wallet
@demox-labs/aleo-wallet-adapter
Leo Wallet / Puzzle Wallet
SDK
@provablehq/sdk
程序执行、证明生成、转账
Smart Contract
Leo Language
编译为 Aleo Instructions
Blockchain
Aleo Testnet / Mainnet
ZK-native L1
Deployment
Vercel
自动部署 + Edge Functions


5. Leo 智能合约设计
5.1 数据结构定义
program zk_invoice.aleo
InvoiceRecord（私密发票记录）
record InvoiceRecord {
    owner: address,           // 发票持有者
    invoice_id: field,        // 发票唯一标识
    seller: address,          // 卖家地址
    buyer: address,           // 买家地址
    amount: u64,              // 金额（microcredits）
    invoice_hash: field,      // 发票内容哈希
    created_at: u32,          // 创建时间戳 
}
PaymentRecord（私密支付收据）
record PaymentRecord {
    owner: address,           // 收据持有者
    invoice_id: field,        // 关联发票ID
    payer: address,           // 付款方
    payee: address,           // 收款方
    amount: u64,              // 支付金额
    paid_at: u32,             // 支付时间戳
}
Mapping（公开状态）
mapping invoice_registry: field => InvoiceStatus;
// InvoiceStatus: 0=PENDING, 1=PAID, 2=CANCELLED
mapping invoice_hash_index: field => field;  // hash => invoice_id
5.2 核心 Transition 函数
create_invoice
async transition create_invoice(
    buyer: address,
    amount: u64,
    invoice_hash: field
) -> (InvoiceRecord, InvoiceRecord, Future)
功能：卖家创建发票，生成两份 InvoiceRecord（卖家/买家各一份），链上注册哈希
cancel_invoice
async transition cancel_invoice(
    invoice: InvoiceRecord,
) -> Future
功能：卖家在买家支付前，作废发票，令该笔交易作废
pay_invoice
async transition pay_invoice(
    invoice: InvoiceRecord,
    payment: credits.aleo/credits
) -> (PaymentRecord, PaymentRecord, credits.aleo/credits, Future)
功能：买家支付发票，消耗 InvoiceRecord，生成 PaymentRecord，执行隐私转账
verify_payment
transition verify_payment(
    payment: PaymentRecord,
    invoice_hash: field
) -> bool
功能：验证支付收据与发票哈希的对应关系

6. 前端页面设计
6.1 页面清单
页面
路由
功能
对应 Aleo 操作
首页
/
产品介绍、连接钱包入口
调用 Wallet Adapter 连接
Dashboard
/dashboard
发票/收据总览(数据概览(待收/待付总额统计))、
聚合 Mapping 与 Record 数据
创建发票
/invoices/create
发票表单、加密、上链
执行 create_invoice 转换
发票管理(列表页)
/invoices
发票搜索、筛选（待付/已付）、状态列表
混合扫描： 同时拉取 InvoiceRecord (待付) 和 PaymentRecord (已付) 进行前端聚合。
发票详情
/invoices/[id]
解密查看、验证、支付
执行 pay_invoice 转换
收据列表
/receipts
支付记录、收据下载
获取所有 PaymentRecord。 每一条记录都是一份法律级别的“付款证明”。
审计中心
/audit
Audit Key 生成、合规报告
分享只读权限给第三方

6.2 核心组件
WalletConnectButton：Leo Wallet / Puzzle Wallet 连接组件
InvoiceForm：发票创建表单（项目明细、金额、买家地址）
InvoiceCard：发票卡片展示（状态、金额、操作按钮）
PaymentModal：支付确认弹窗（金额确认、手续费预估）
ReceiptViewer：收据查看器（ZK证明展示、导出功能）
AuditKeyGenerator：审计密钥生成器（选择发票、设置有效期）
7. 前端 API 设计
基于 @provablehq/sdk 和 @demox-labs/aleo-wallet-adapter 封装的前端服务层：
invoiceService.create(data)：加密发票数据 → 调用 create_invoice → 返回 TxID
invoiceService.decrypt(encryptedData)：使用私钥解密发票内容
invoiceService.verify(invoiceId, hash)：链上验证发票哈希
paymentService.pay(invoice, amount)：执行 pay_invoice 隐私转账
paymentService.getReceipts()：获取当前账户的所有 PaymentRecord
auditService.generateKey(invoiceIds, expiry)：生成限定范围的 Audit Key

8. 前端架构设计
8.1 架构设计图
                                 [View]

                                    ⇅

                            [Controller]

                                ↓       ↓

                      [Service]   [Model]
8.2 架构说明
为了实现复杂业务逻辑与 Aleo 底层协议的深度解耦，系统采用 View、Controller、Service、Model 四层架构。
8.2.1: View层(视图层)
职责：负责 UI 渲染、用户交互、以及展示推导后的业务状态。
交互限制：仅与 Controller 层交互。它不直接读取 Store，也不直接调用 Aleo SDK
8.2.2: Controller层(逻辑控制层)
职责：系统的“指挥中心”。负责接收 View 的指令，协调 Service进行计算，并根据结果更新 Model。
核心功能：
状态推导：从 Model 获取原始 Record 和 Mapping，推导出业务语义（如：`isPaid`, `canCancel`）。
流程控制：：管理异步交易生命周期（Pending -> Mining -> Confirmed）。
异常处理：捕获 Service 层的底层错误，并转化为用户友好的提示传递给 View。
交互对象：向上对接 View，向下对接 Service 和 Model。
8.2.3: Service层(服务适配层)
职责：负责所有“重型”和“底层”操作。它是 Aleo 协议的适配器。
核心功能：
Aleo SDK 交互：封装 `requestRecords`、执行 `Transition`、生成 ZKP 证明。
加密算法：执行发票明细的 AES 加密、Audit Key 的派生、SHA-256 哈希计算。
单位转换：处理 Microcredits 与 Credits 之间的精度转换。
 交互对象：被 Controller 调用，不直接操作 Model。
8.2.4: Model层(数据存储层)
职责：系统的数据源，管理全局状态。
核心组成：
Zustand Store：存储从链上同步回来的原始 Record 密文、Mapping 公开状态。
IndexedDB (Cache)：本地持久化存储用户已解密的私密发票详情。
交互对象：被 Controller 读取或更新，为 Controller 提供推导原始数据。
8.3 View层
8.3.1: 首页(/)
核心目标：品牌展示、环境检查与钱包入口。
核心组件
HeroSection: 产品核心价值主张展示组件
FeatureGrid: 隐私支付、合规审计、零知识证明等特性介绍卡片
WalletConnectCard: 钱包交互核心组件
IDLE：显示“连接 Leo 钱包”大按钮
CONNECTING：按钮置灰并显示 Spinner，提示“正在申请钱包权限”。
AUTHORIZED：显示“进入管理后台”并呈现用户头像/地址缩写。
ERROR：提示“未检测到插件”或“用户拒绝连接”。
NetworkStatusBar: 显示 Aleo 网络连接状态（Mainnet/Testnet）及当前区块高度。
8.3.2: Dashboard页(/dashboard)
核心目标：负责宏观数据的聚合与推导结果的即时呈现。
核心组件：
 StatSummaryGroup: 汇总数据组件。
CreditBalanceCard: 显示用户当前钱包余额
PendingPaymentStats：显示由 Controller 推导出的“待收金额”、“待付金额”、“已结总额”
 QuickActionTools: 快捷操作栏。提供“立即开票”、“一键同步账本”的悬浮按钮。
RecentActivityFeed: 最近动态列表。展示最新的 Record 状态变更（如：刚刚收到一张新发票）
SyncOverlay： 全局数据同步遮罩。当 `Service` 层正在扫描链上新块时，在页面底部显示轻量级加载条。
8.3.3: 创建发票页(/invoices/create)
核心目标：表单采集与 ZKP 证明生成监控。
核心组件：
BuyerIdentityField: 买家身份组件。支持 Aleo 地址输入及格式合法性校验。
InvoiceItemEditor: 动态表单组件。用于录入 SKU、单价、数量，自动计算总价。
FileDropzone: 附件处理组件。用户上传 PDF 后，调用 `Service.hashFile()` 生成上链哈希，不存储原文件。
ZKPProofTerminal: 证明生成监控器。当卖家点击“创建”后，该组件覆盖页面，展示本地生成零知识证明的日志和进度。
PrivacySettingPanel: 隐私分级选项，选择是否预设特定的审计权限。
8.3.4: 发票管理页(/invoices)
核心目标：基于多态 Record 的状态推导列表。
核心组件：
StatusFilterTabs: 业务状态选项卡。由 Controller 定义：全部、待支付（Pending）、已支付（Paid）、已撤回（Canceled）
InvoiceSearchBar: 搜索组件。支持按 `invoice_id` 或买/卖家地址过滤。
EnhancedInvoiceTable： 核心列表容器。
InvoiceRowItem: 单行组件。订阅 Controller 推导出的 `displayStatus` 渲染颜色。
 ActionCell: 操作单元格。根据状态动态渲染“支付”、“撤回”或“查看详情”按钮。
GlobalSyncButton: 手动触发 Service 层全量扫描 Record 的刷新按钮。

8.3.5: 发票详情页(/invoices/[id])
核心目标：隐私解密查看与支付动作触发。
核心组件：
DecryptionGuard: 解密屏障。若 Model 中无明细，提示用户通过 View Key 解密。
InvoiceDetailHeader: 基础信息区。显示状态、金额、双方地址。
LineItemTable: 明细展示区。显示解密后的发票项。
ZKPPaymentPanel**: 支付交互区。买家专用，显示 Gas 预估并触发 `pay_invoice` 的 Controller 动作。
CancelActionModal: 撤回确认弹窗。卖家专用，提示物理销毁 Record 的风险。
VerificationShield: 验证标识。展示该发票在链上有效性的 ZK 验证结果。

8.3.6: 收据列表页(/receipts)
核心目标：支付存证归档。
核心组件：
PaymentReceiptGrid: 收据展示网格。主要订阅 `PaymentRecord`。
ReceiptSummaryCard: 收据卡片。强调支付时间、交易哈希（Transaction ID）
EvidenceLink: 链上存证链接。跳转到 Aleo Explorer 查看该笔支付的 Nullifier 证明
BatchExportController: 批量导出组件。勾选多个收据进行财务导出。

8.3.7: 审计中心(/audit)
核心目标：Audit Key 管理与合规导出。
核心组件：
AuditKeyGenerator: 密钥派生组件。根据选中的 Record 调用 Service 生成对应的 Audit Key。
DisclosurePanel: 披露设置。选择向审计方开放的字段（仅金额、或含明细）。
ComplianceReportDownloader: 报告生成器。将本地解密数据与链上证明组合，生成合规性 PDF。
AuditKeyHistory: 已授权密钥记录。管理已发出的权限及其有效期。
8.4 Model层
8.4.1: walletStore(基础身份与余额)
负责存储钱包连接状态、地址以及 Aleo 官方 Credits 的原始数据。


// stores/walletStore.ts
interface WalletState {
  address: string | null;
  connected: boolean;
  isLoggingIn: boolean; // 连接中的加载状态
  publicBalance: u64;   // 公开余额
  privateBalance: u64;  // 私有余额（统计结果）
  creditsRecords: Record[]; // 原始的 credits.aleo 记录，用于支付手续费
  network: 'mainnet' | 'testnet';
}


interface WalletActions {
  // 仅负责原子同步状态
  setAccount: (address: string | null) => void;
  updateBalances: (publicBal: u64, privateBal: u64) => void;
  setCreditsRecords: (records: Record[]) => void;
  reset: () => void;
}

8.4.2: invoiceStore(发票密文与状态)
核心发票存储，保存从链上扫描到的原始 `InvoiceRecord` 及其在 Mapping 中的状态。



// stores/invoiceStore.ts
interface InvoiceState {
  rawInvoices: Record[];       // 原始的加密 InvoiceRecord 列表
  mappingStatuses: Map<string, number>; // invoice_id -> 链上公开状态(0/1/2)
  lastSyncHeight: number;      // 扫描的最后区块高度，用于增量更新
  isLoading: boolean;
  error: string | null;
}


interface InvoiceActions {
  // 由 Controller 调用，用于同步 Service 获取的数据
  setRawInvoices: (records: Record[]) => void;
  updateMappingStatuses: (statuses: Map<string, number>) => void;
  setSyncHeight: (height: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}



8.4.3: paymentStore(支付回执与存证)
专门存储 `PaymentRecord`（收据）以及交易哈希关联关系。



// stores/paymentStore.ts
interface PaymentState {
  receivedPayments: Record[]; // 作为卖家收到的支付款项 Record
  sentReceipts: Record[];     // 作为买家支付后获得的收据存证
  txMapping: Map<string, string>; // invoice_id -> Transaction ID
  isLoading: boolean;
}


interface PaymentActions {
  addPaymentRecord: (record: Record) => void;
  setSentReceipts: (records: Record[]) => void;
  linkTx: (invoiceId: string, txId: string) => void;
}


8.4.4: archiveStore(本地持久化明细)
存储通过 View Key 解密后的明细数据（存在 IndexedDB），这是推导详情的关键。



// stores/archiveStore.ts
interface ArchiveState {
  // 以 invoice_hash 或 invoice_id 为键，存储解密后的结构化对象
  decryptedDetails: Map<string, {
    items: InvoiceItem[];
    fileHash: string;
    description: string;
    timestamp: number;
  }>;
  auditKeyHistory: AuditKeyEntry[]; // 存储发出的审计授权记录
}


interface ArchiveActions {
  saveDecryptedDetail: (id: string, detail: any) => void;
  addAuditLog: (entry: AuditKeyEntry) => void;
  clearCache: () => void;
}

8.4.5: TransactionStore(实时证明进度)
管理正在生成的零知识证明（ZKP）状态，供 View 层展示进度。



// stores/transactionStore.ts
interface TransactionState {
  currentTxId: string | null;  // 正在生成的交易临时 ID
  status: 'idle' | 'proving' | 'broadcasting' | 'completed' | 'failed';
  progress: number;            // 0 - 100
  log: string[];               // Leo 证明生成的实时日志流
  lastError: string | null;
}


interface TransactionActions {
  updateStatus: (status: TransactionState['status']) => void;
  setProgress: (val: number) => void;
  appendLog: (msg: string) => void;
  setTxError: (err: string | null) => void;
}

8.5 Service层
8.5.1: AleoProtocolService(链上通信适配器)
该类负责所有与 Aleo 节点及钱包插件的直接 RPC 通信。



// services/AleoProtocolService.ts
interface IAleoProtocolService {
  /** 拉取指定地址下特定程序的原始加密 Record */
  requestUserRecords(programId: string, address: string): Promise<RawRecord[]>;
  
  /** 获取链上公开 Mapping 状态（例如：发票是否已在链上标记为撤回） */
  getMappingValue(programId: string, mappingName: string, key: string): Promise<string | null>;
  
  /** 广播已生成的零知识证明交易 */
  broadcastTransaction(txId: string, proof: any): Promise<{ success: boolean; txHash: string }>;
  
  /** 监听交易状态直到确认 */
  waitForConfirmation(txHash: string): Promise<TransactionReceipt>;
}

8.5.2: ZKProofService(零知识证明生成器)
该类专门处理 WASM 层的重计算任务，负责调用 Prover 生成 ZKP。



// services/ZKProofService.ts
interface IZKProofService {
  /** 生成创建发票的证明：卖家调用 */
  generateCreateInvoiceProof(params: CreateInvoiceInputs): Promise<ExecutionProof>;
  
  /** 生成支付发票的证明：买家调用 */
  generatePayInvoiceProof(invoiceRecord: RawRecord, paymentAmount: u64): Promise<ExecutionProof>;
  
  /** 生成撤转发票的证明：卖家在 Mapping 登记状态 */
  generateCancelInvoiceProof(invoiceRecord: RawRecord): Promise<ExecutionProof>;
  
  /** 实时订阅证明生成的进度日志（用于 View 层展示进度条） */
  subscribeProofProgress(onProgress: (log: string, percent: number) => void): void;
}


8.5.3: CryptoEncryptionService(隐私加解密服务)
该类负责本地隐私计算，确保明细数据在离开客户端前已加密。



// services/CryptoEncryptionService.ts
interface ICryptoEncryptionService {
  /** 对发票明细进行哈希处理，用于链上校验存证 */
  computeInvoiceHash(items: InvoiceItem[], salt: string): string;
  
  /** 使用 Aleo ViewKey 解密 Record 中的私有数据 */
  decryptRecordData(ciphertext: string, viewKey: string): Promise<PlaintextData>;
  
  /** 派生审计密钥：允许第三方在不触碰私钥的前提下查看特定 Record 内容 */
  deriveAuditKey(record: RawRecord, ownerPrivateKey: string): string;
  
  /** 对本地存储的明细进行二次加密（AES-GCM） */
  encryptLocalData(data: object, masterKey: string): string;
}

8.5.4: FileArchiveService(文件与元数据服务)
该类负责管理解密后的明细与附件的本地索引。



// services/FileArchiveService.ts
interface IFileArchiveService {
  /** 计算上传文件的 SHA-256，确保其与链上记录匹配 */
  calculateFileHash(file: File): Promise<string>;
  
  /** 将解密后的发票明细持久化到 IndexedDB */
  saveToIndexedDB(invoiceId: string, details: DecryptedInvoice): Promise<void>;
  
  /** 从本地缓存提取解密数据 */
  fetchLocalMetadata(invoiceId: string): Promise<DecryptedInvoice | null>;
}
8.6 Controller层：业务逻辑编排(Custom Hooks)
8.6.1: WalletController(身份与环境控制器)
职责：协调钱包插件、同步账户余额、管理登录生命周期



// controllers/useWalletController.ts
interface IWalletController {
  /** 状态推导：从 Model 获取余额并转换为可读格式 */
  walletInfo: {
    address: string | null;
    displayBalance: string; // "125.50 Aleo"
    status: 'connected' | 'disconnected' | 'syncing';
  };


  /** 交互：连接钱包并初始化 Model */
  handleConnect(): Promise<void>;


  /** 交互：断开连接并清理所有 Store */
  handleDisconnect(): void;


  /** 逻辑编排：调用 Service 获取最新余额并更新 WalletStore */
  refreshAccountData(): Promise<void>;
}

8.6.2: InvoiceController(发票流转控制器)
职责：这是最复杂的控制器，负责 Record 的状态推导（Pending/Paid/Canceled）及业务动作触发。



// controllers/useInvoiceController.ts
interface IInvoiceController {
  /** 状态推导：核心逻辑！
   * 1. 从 InvoiceStore 获取原始 Record
   * 2. 从 PaymentStore 获取收据
   * 3. 从 Mapping 获取挂失状态
   * 4. 组合成 View 层直接可用的业务对象
   */
  invoices: Array<{
    id: string;
    amount: number;
    status: 'PENDING' | 'PAID' | 'CANCELED';
    role: 'SELLER' | 'BUYER';
    canPay: boolean;
    canCancel: boolean;
  }>;


  /** 逻辑编排：同步全量数据
   * 调用 Service.requestUserRecords -> 更新 InvoiceStore/PaymentStore
   */
  syncAllData(): Promise<void>;


  /** 逻辑编排：处理解密请求
   * 调用 Service.decryptRecordData -> 更新 ArchiveStore (LocalDB)
   */
  decryptInvoice(id: string): Promise<void>;
}

8.6.3: TransactionController(交易与证明执行器)
职责：管理高耗时的 ZKP 生成流程，协调进度条展示。



// controllers/useTransactionController.ts
interface ITransactionController {
  /** 状态推导：订阅 TransactionStore 获取实时进度 */
  txProgress: {
    isProcessing: boolean;
    stage: 'PROVING' | 'BROADCASTING';
    percent: number;
    log: string[];
  };


  /** 逻辑编排：创建发票全流程
   * 1. 调用 Service 生成哈希
   * 2. 调用 Service 生成 ZKP (同时更新进度)
   * 3. 调用 Service 广播
   * 4. 成功后触发 InvoiceController.syncAllData()
   */
  executeCreateInvoice(formData: InvoiceFormData): Promise<string>;


  /** 逻辑编排：支付发票全流程
   * 1. 验证余额
   * 2. 调用 Service 生成支付证明
   * 3. 更新 Model 状态
   */
  executePay(invoiceId: string): Promise<void>;
}


8.6.4: AuditController(审计与导出控制器)
职责：处理隐私数据的授权导出与合规报告生成。



// controllers/useAuditController.ts
interface IAuditController {
  /** 逻辑编排：生成并导出审计包
   * 1. 从 ArchiveStore 读取解密明细
   * 2. 调用 Service.deriveAuditKey 生成密钥
   * 3. 调用 Service 生成归档 PDF
   */
  exportAuditPackage(invoiceId: string): Promise<void>;


  /** 交互：验证第三方提供的审计证明 */
  verifyProof(proofData: string): Promise<boolean>;
}



9. Hackathon 评审标准对齐
评审维度
评审要点
ZK-Invoice 亮点
Innovation
ZK技术的创新应用
首个隐私B2B发票系统，Record+Mapping混合模型
Technical
功能完整性、代码质量、安全性
三阶段完整流程、利用原生View Key
UX
用户友好、易用性
一键支付、自动对账、直观Dashboard
Practicality
实际应用场景、商业价值
跨境B2B支付、供应链金融真实痛点
ZK Proof Usage
ZK证明的有效利用
隐私支付+选择性披露+链上验证三位一体

10. 项目里程碑（建议）
阶段
交付物
验收标准
M1
Leo 合约 + 本地测试
leo run 通过所有transition测试
M2
前端 UI + 钱包连接
Leo Wallet连接成功，UI渲染正常
M3
Testnet 部署 + 端到端测试
创建-支付-验证全流程跑通
M4
审计功能 + Demo视频
Audit Key披露功能可用，2-3分钟演示视频

101. 风险与限制
USDCx 主网时间：预计2026年1月底，MVP使用credits.aleo替代
证明生成时间：复杂transition可能需要10-30秒，需添加loading状态
钱包兼容性：优先支持Leo Wallet，Puzzle Wallet作为备选
链下数据存储：MVP阶段使用localStorage，后期考虑IPFS/加密云存储


ZK-Invoice PRD 补充文档
技术细化 · 开发规范 · 测试用例
版本: 1.0  |  日期: 2025-01-04  |  Aleo Buildathon
1. Leo 智能合约完整实现
1.1 合约数据结构定义
以下为 ZK-Invoice 合约的完整数据结构，基于 Aleo 最新 Leo 语法规范（2024-2025）：
program zk_invoice.aleo;


// ========== 常量定义 ==========
const STATUS_PENDING: u8 = 0u8;
const STATUS_PAID: u8 = 1u8;
const STATUS_CANCELLED: u8 = 2u8;
const STATUS_EXPIRED: u8 = 3u8;


// ========== 结构体定义 ==========
struct InvoiceData {
    seller: address,
    buyer: address,
    amount: u64,           // 单位: microcredits (1 credit = 1,000,000 microcredits)
    due_date: u32,         // Unix timestamp
    invoice_number: field  // 发票编号的哈希值
}


// ========== Record 定义 ==========
record InvoiceRecord {
    owner: address,        // Record 所有者 (必须字段)
    invoice_id: field,     // 发票唯一标识
    seller: address,
    buyer: address,
    amount: u64,
    invoice_hash: field,   // 发票内容哈希
    due_date: u32,
    created_at: u32
}


record PaymentRecord {
    owner: address,
    payment_id: field,
    invoice_id: field,
    payer: address,
    payee: address,
    amount: u64,
    paid_at: u32
}


// ========== Mapping 定义 ==========
mapping invoice_status: field => u8;      // invoice_id => status
mapping invoice_hash_index: field => field; // invoice_hash => invoice_id
mapping payment_index: field => field;    // invoice_id => payment_id
1.2 核心 Transition 实现
1.2.1 create_invoice - 创建发票
transition create_invoice(
    buyer: address,
    amount: u64,
    due_date: u32,
    invoice_hash: field,
    nonce: field
) -> (InvoiceRecord, InvoiceRecord, Future) {
    let seller: address = self.caller;
    
    // 验证：卖家不能是买家
    assert_neq(seller, buyer);
    
    // 验证：金额必须大于0
    assert(amount > 0u64);
    
    // 生成唯一发票ID (使用 BHP256 哈希)
    let invoice_data: InvoiceData = InvoiceData {
        seller: seller,
        buyer: buyer,
        amount: amount,
        due_date: due_date,
        invoice_number: nonce
    };
    let invoice_id: field = BHP256::hash_to_field(invoice_data);
    
    // 创建卖家的发票记录
    let seller_record: InvoiceRecord = InvoiceRecord {
        owner: seller,
        invoice_id: invoice_id,
        seller: seller,
        buyer: buyer,
        amount: amount,
        invoice_hash: invoice_hash,
        due_date: due_date,
        created_at: 0u32  // 链下记录实际时间
    };
    
    // 创建买家的发票记录
    let buyer_record: InvoiceRecord = InvoiceRecord {
        owner: buyer,
        invoice_id: invoice_id,
        seller: seller,
        buyer: buyer,
        amount: amount,
        invoice_hash: invoice_hash,
        due_date: due_date,
        created_at: 0u32
    };
    
    return (seller_record, buyer_record, finalize_create_invoice(invoice_id, invoice_hash));
}


async function finalize_create_invoice(
    invoice_id: field,
    invoice_hash: field
) {
    // 检查发票是否已存在
    let exists: bool = Mapping::contains(invoice_status, invoice_id);
    assert(!exists);
    
    // 设置发票状态为待付款
    Mapping::set(invoice_status, invoice_id, STATUS_PENDING);
    
    // 建立哈希到ID的索引
    Mapping::set(invoice_hash_index, invoice_hash, invoice_id);
}
1.2.2 pay_invoice - 支付发票
transition pay_invoice(
    invoice: InvoiceRecord,
    payment: credits.aleo/credits,
    payment_nonce: field
) -> (PaymentRecord, PaymentRecord, credits.aleo/credits, Future) {
    let payer: address = self.caller;
    
    // 验证：调用者必须是发票的买家
    assert_eq(payer, invoice.buyer);
    
    // 验证：支付金额必须足够
    assert(payment.microcredits >= invoice.amount);
    
    // 生成支付ID
    let payment_id: field = BHP256::commit_to_field(invoice.invoice_id, payment_nonce as scalar);
    
    // 执行私密转账 (调用 credits.aleo)
    let (to_seller, change): (credits.aleo/credits, credits.aleo/credits) = 
        credits.aleo/transfer_private(payment, invoice.seller, invoice.amount);
    
    // 创建买家的支付凭证
    let payer_receipt: PaymentRecord = PaymentRecord {
        owner: payer,
        payment_id: payment_id,
        invoice_id: invoice.invoice_id,
        payer: payer,
        payee: invoice.seller,
        amount: invoice.amount,
        paid_at: 0u32
    };
    
    // 创建卖家的支付凭证
    let payee_receipt: PaymentRecord = PaymentRecord {
        owner: invoice.seller,
        payment_id: payment_id,
        invoice_id: invoice.invoice_id,
        payer: payer,
        payee: invoice.seller,
        amount: invoice.amount,
        paid_at: 0u32
    };
    
    return (payer_receipt, payee_receipt, change, finalize_pay_invoice(invoice.invoice_id, payment_id));
}


async function finalize_pay_invoice(
    invoice_id: field,
    payment_id: field
) {
    // 验证发票状态为待付款
    let current_status: u8 = Mapping::get(invoice_status, invoice_id);
    assert_eq(current_status, STATUS_PENDING);
    
    // 更新发票状态为已付款
    Mapping::set(invoice_status, invoice_id, STATUS_PAID);
    
    // 记录支付索引
    Mapping::set(payment_index, invoice_id, payment_id);
}
1.2.3 verify_invoice - 验证发票
transition verify_invoice(
    invoice: InvoiceRecord,
    expected_hash: field
) -> bool {
    // 验证发票哈希匹配
    return invoice.invoice_hash == expected_hash;
}
1.2.4 cancel_invoice - 取消发票
transition cancel_invoice(
    invoice: InvoiceRecord
) -> Future {
    let caller: address = self.caller;
    
    // 只有卖家可以取消发票
    assert_eq(caller, invoice.seller);
    
    return finalize_cancel_invoice(invoice.invoice_id);
}


async function finalize_cancel_invoice(invoice_id: field) {
    let current_status: u8 = Mapping::get(invoice_status, invoice_id);
    assert_eq(current_status, STATUS_PENDING);
    Mapping::set(invoice_status, invoice_id, STATUS_CANCELLED);
}

2. 加密方案详细设计
2.1 加密架构概览
ZK-Invoice 采用双层加密架构，结合 Aleo 原生加密与链下应用层加密：
加密层
说明
链上层 (Aleo Native)
Record 自动加密、View Key 解密机制
应用层 (AES-256-GCM)
发票明细加密存储、链下传输加密

2.2 发票内容加密流程
Step 1: 生成加密密钥
// 使用 ECDH 密钥交换生成共享密钥
const sellerPrivateKey = wallet.getPrivateKey();
const buyerPublicKey = await fetchBuyerPublicKey(buyerAddress);
const sharedSecret = ecdh.computeSecret(buyerPublicKey);
const encryptionKey = hkdf(sharedSecret, 'zk-invoice-encryption', 32);
Step 2: 加密发票明细
interface InvoiceDetails {
  invoiceNumber: string;      // 发票编号
  lineItems: LineItem[];      // 明细行
  taxInfo: TaxInfo;           // 税务信息
  notes: string;              // 备注
  attachments: Attachment[];  // 附件哈希
}


async function encryptInvoiceDetails(
  details: InvoiceDetails,
  encryptionKey: Uint8Array
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(details));
  
  const key = await crypto.subtle.importKey(
    'raw', encryptionKey, { name: 'AES-GCM' }, false, ['encrypt']
  );
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, plaintext
  );
  
  return { iv: base64(iv), ciphertext: base64(ciphertext) };
}
Step 3: 生成发票哈希 (用于链上存储)
async function generateInvoiceHash(details: InvoiceDetails): Promise<string> {
  const canonicalJson = JSON.stringify(details, Object.keys(details).sort());
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(canonicalJson)
  );
  return toAleoField(hashBuffer); // 转换为 Aleo field 格式
}
2.3 审计密钥生成
审计密钥基于 Aleo View Key 机制，实现选择性披露：
interface AuditKeyConfig {
  invoiceIds: string[];      // 可查看的发票列表
  permissions: Permission[]; // READ_AMOUNT | READ_PARTIES | READ_DETAILS
  expiresAt: number;         // Unix timestamp
  auditorAddress: string;    // 审计方地址
}


async function generateAuditKey(config: AuditKeyConfig): Promise<AuditKey> {
  const derivedKey = await deriveKeyFromViewKey(wallet.viewKey, config);
  const signature = await wallet.signMessage(JSON.stringify(config));
  
  return {
    key: derivedKey,
    config: config,
    signature: signature,
    issuedAt: Date.now()
  };
}

3. TypeScript 类型定义
3.1 核心数据类型
// ========== Aleo 基础类型 ==========
type AleoAddress = `aleo1${string}`;
type AleoField = `${string}field`;
type AleoTransactionId = `at1${string}`;
type Microcredits = bigint; // 1 credit = 1_000_000 microcredits


// ========== 发票相关类型 ==========
enum InvoiceStatus {
  PENDING = 0,
  PAID = 1,
  CANCELLED = 2,
  EXPIRED = 3
}


interface Invoice {
  id: AleoField;
  seller: AleoAddress;
  buyer: AleoAddress;
  amount: Microcredits;
  invoiceHash: AleoField;
  dueDate: Date;
  createdAt: Date;
  status: InvoiceStatus;
  details?: InvoiceDetails; // 解密后的明细
}


interface InvoiceDetails {
  invoiceNumber: string;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  notes?: string;
}


interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}
3.2 API 服务层类型
// ========== Invoice Service ==========
interface CreateInvoiceParams {
  buyer: AleoAddress;
  amount: Microcredits;
  dueDate: Date;
  details: InvoiceDetails;
}


interface CreateInvoiceResult {
  transactionId: AleoTransactionId;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  encryptedDetails: EncryptedPayload;
}


interface InvoiceService {
  create(params: CreateInvoiceParams): Promise<CreateInvoiceResult>;
  getById(id: AleoField): Promise<Invoice | null>;
  getByHash(hash: AleoField): Promise<Invoice | null>;
  listByRole(role: 'seller' | 'buyer'): Promise<Invoice[]>;
  cancel(id: AleoField): Promise<AleoTransactionId>;
  verify(id: AleoField, hash: AleoField): Promise<boolean>;
}


// ========== Payment Service ==========
interface PayInvoiceParams {
  invoiceId: AleoField;
  paymentRecord: string; // credits.aleo record plaintext
}


interface PaymentResult {
  transactionId: AleoTransactionId;
  paymentId: AleoField;
  changeRecord?: string;
}


interface PaymentService {
  pay(params: PayInvoiceParams): Promise<PaymentResult>;
  getReceipt(paymentId: AleoField): Promise<PaymentReceipt | null>;
  listReceipts(): Promise<PaymentReceipt[]>;
}

4. 数据流时序设计
4.1 创建发票时序
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  卖家   │     │ Frontend│     │  Wallet │     │  Aleo   │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │──1.填写发票──>│               │               │
     │               │               │               │
     │               │──2.获取买家公钥───────────────>│
     │               │<─────────────返回公钥──────────│
     │               │               │               │
     │               │──3.本地加密发票明细            │
     │               │  (AES-256-GCM)                 │
     │               │               │               │
     │               │──4.计算发票哈希                │
     │               │  (SHA-256 → field)             │
     │               │               │               │
     │               │──5.请求签名──>│               │
     │               │<────授权成功──│               │
     │               │               │               │
     │               │──6.提交交易───────────────────>│
     │               │  create_invoice(buyer, amount, │
     │               │    due_date, hash, nonce)      │
     │               │               │               │
     │               │<──────────7.返回 TxID + Records│
     │               │               │               │
     │               │──8.本地存储加密明细            │
     │               │  (localStorage/IndexedDB)      │
     │               │               │               │
     │<──9.显示成功──│               │               │
4.2 支付发票时序
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  买家   │     │ Frontend│     │  Wallet │     │  Aleo   │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │──1.查看待付发票─>│              │               │
     │               │               │               │
     │               │──2.请求Record列表──>│          │
     │               │<────返回Records────│           │
     │               │               │               │
     │               │──3.解密发票Record             │
     │               │──4.解密发票明细(本地)          │
     │               │               │               │
     │<──5.显示发票详情│              │               │
     │               │               │               │
     │──6.确认支付──>│               │               │
     │               │               │               │
     │               │──7.查询链上状态────────────────>│
     │               │<────────status=PENDING─────────│
     │               │               │               │
     │               │──8.构建支付交易                │
     │               │──9.请求签名──>│               │
     │               │<────授权成功──│               │
     │               │               │               │
     │               │──10.提交pay_invoice───────────>│
     │               │<────返回 TxID + PaymentRecords─│
     │               │               │               │
     │<──11.显示支付成功│              │               │

5. 前端状态管理设计
5.1 Zustand Store 结构
// stores/walletStore.ts
interface WalletState {
  connected: boolean;
  address: AleoAddress | null;
  publicBalance: Microcredits;
  privateBalance: Microcredits;
  creditsRecords: CreditsRecord[];
  isLoading: boolean;
  error: string | null;
}


interface WalletActions {
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  refreshRecords: () => Promise<void>;
}


// stores/invoiceStore.ts
interface InvoiceState {
  sentInvoices: Invoice[];      // 作为卖家发出的
  receivedInvoices: Invoice[];  // 作为买家收到的
  paymentReceipts: PaymentReceipt[];
  selectedInvoice: Invoice | null;
  isLoading: boolean;
  filter: InvoiceFilter;
}


interface InvoiceActions {
  fetchInvoices: () => Promise<void>;
  createInvoice: (params: CreateInvoiceParams) => Promise<CreateInvoiceResult>;
  payInvoice: (id: AleoField) => Promise<PaymentResult>;
  cancelInvoice: (id: AleoField) => Promise<void>;
  setFilter: (filter: InvoiceFilter) => void;
  selectInvoice: (invoice: Invoice | null) => void;
}
5.2 链下存储方案
采用 IndexedDB 进行本地加密数据持久化：
// lib/storage.ts
const DB_NAME = 'zk-invoice-db';
const DB_VERSION = 1;


interface DBSchema {
  encryptedInvoices: {     // Store: 加密的发票明细
    key: string;           // invoice_id
    value: {
      invoiceId: string;
      ciphertext: string;  // Base64 encoded
      iv: string;          // Base64 encoded
      createdAt: number;
    };
    indexes: { byCreatedAt: number };
  };
  transactionHistory: {    // Store: 交易历史
    key: string;           // transaction_id
    value: {
      txId: string;
      type: 'create' | 'pay' | 'cancel';
      invoiceId: string;
      status: 'pending' | 'confirmed' | 'failed';
      timestamp: number;
    };
    indexes: { byInvoiceId: string; byTimestamp: number };
  };
  auditKeys: {             // Store: 审计密钥
    key: string;           // audit_key_id
    value: AuditKey;
  };
}

6. 测试用例定义
6.1 Leo 合约单元测试
ID
测试场景
输入
预期结果
TC-001
正常创建发票
有效买家地址, amount>0
返回2个InvoiceRecord
TC-002
自己给自己开票
buyer == seller
assert_neq 失败
TC-003
金额为0
amount = 0u64
assert 失败
TC-004
正常支付发票
有效InvoiceRecord, 足够余额
返回2个PaymentRecord + change
TC-005
非买家支付
caller != invoice.buyer
assert_eq 失败
TC-006
余额不足
microcredits < amount
assert 失败
TC-007
重复支付
status == PAID
finalize assert_eq 失败
TC-008
卖家取消发票
caller == seller
status 更新为 CANCELLED
TC-009
非卖家取消
caller != seller
assert_eq 失败

6.2 前端集成测试
ID
测试场景
验证点
IT-001
钱包连接
Leo Wallet 弹窗、授权后显示地址、余额正确
IT-002
创建发票E2E
表单提交→签名请求→Loading→成功提示→列表刷新
IT-003
支付发票E2E
选择Record→确认支付→签名→状态变更为PAID
IT-004
加密/解密验证
明细加密后买家可解密、卖家可解密、第三方不可解密
IT-005
审计密钥功能
生成密钥→限定范围可查看→过期后失效
IT-006
离线数据恢复
清除localStorage→重新连接→从链上恢复Record

6.3 Leo 合约测试命令
使用 leo run 命令进行本地测试：
# 测试创建发票
leo run create_invoice \
  aleo1buyer... \             # buyer
  1000000u64 \               # amount (1 credit)
  1735689600u32 \            # due_date (2025-01-01)
  123456789field \           # invoice_hash
  987654321field              # nonce


# 测试支付发票 (需要先获取 InvoiceRecord 和 credits record)
leo run pay_invoice \
  '{owner:aleo1...,invoice_id:...,seller:...,buyer:...,amount:...,invoice_hash:...,due_date:...,created_at:...}' \
  '{owner:aleo1...,microcredits:2000000u64}' \
  111222333field

7. 依赖版本与配置
7.1 package.json 核心依赖
{
  "dependencies": {
    "@provablehq/sdk": "^1.0.0",
    "@demox-labs/aleo-wallet-adapter-react": "^1.0.0",
    "@demox-labs/aleo-wallet-adapter-reactui": "^1.0.0",
    "@demox-labs/aleo-wallet-adapter-leo": "^1.0.0",
    "next": "14.2.x",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0",
    "idb": "^8.0.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/react": "^18.3.0",
    "vitest": "^1.6.0"
  }
}
7.2 Leo 项目配置 (program.json)
{
  "program": "zk_invoice.aleo",
  "version": "0.1.0",
  "description": "Privacy-preserving B2B invoice system",
  "license": "MIT",
  "dependencies": {
    "credits.aleo": "credits.aleo"
  }
}
7.3 网络配置
环境
API Endpoint
Testnet
https://api.explorer.provable.com/v1
Mainnet
https://api.explorer.provable.com/v1

8. 附录：技术参考
8.1 Aleo 数值单位参考
单位
值
用途
1 credit
1,000,000 microcredits
显示单位
1 microcredit
1u64
合约计算单位
部署费 (估算)
~5 credits
程序部署
执行费 (估算)
0.01-0.1 credits
交易执行


— 文档结束 —

