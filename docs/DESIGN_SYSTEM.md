# Alpaca-Invoice 前端重构设计文档

> 版本: 1.0  
> 日期: 2026-01-19  
> 目标: 将 MVP Demo 级别 UI 升级为专业级 SaaS 产品界面

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [现状分析](#2-现状分析)
3. [品牌定位与设计方向](#3-品牌定位与设计方向)
4. [视觉规范系统](#4-视觉规范系统)
5. [组件设计规范](#5-组件设计规范)
6. [页面重构方案](#6-页面重构方案)
7. [交互与动效规范](#7-交互与动效规范)
8. [文案规范](#8-文案规范)
9. [技术实施方案](#9-技术实施方案)
10. [实施路线图](#10-实施路线图)

---

## 1. 执行摘要

### 1.1 重构目标

将 Alpaca-Invoice 从当前的 **Demo 原型** 升级为 **专业级金融 SaaS 产品**，建立独特的 "Alpaca" 品牌视觉语言，传达 **"可信赖的温暖"** 品牌调性。

### 1.2 核心改进

| 维度 | 当前状态 | 目标状态 |
|------|----------|----------|
| **配色** | 单一 amber 黄 + 灰色 | 深靛蓝主色 + 琥珀金点缀 |
| **字体** | 系统默认 sans-serif | Plus Jakarta Sans + 中文思源黑体 |
| **图标** | Emoji 表情符号 | 统一 Lucide 图标库 |
| **布局** | 单栏卡片堆叠 | 侧边导航 + 数据可视化仪表盘 |
| **动效** | 几乎无动画 | 精细微交互 + 页面过渡 |
| **品牌** | 无吉祥物/Logo | Alpaca 吉祥物 + 品牌标识 |

### 1.3 推荐技术栈升级

- **UI 模板参考**: TailAdmin Next.js (免费版)
- **组件库**: shadcn/ui (已部分引入)
- **图标库**: Lucide React
- **动画库**: Framer Motion
- **图表库**: Recharts (已引入) / ApexCharts

---

## 2. 现状分析

### 2.1 当前代码结构

```
app/
├── page.tsx              # 首页 (Hero + 快捷操作)
├── dashboard/page.tsx    # 仪表盘 (统计卡片 + 发票列表)
├── invoices/
│   ├── page.tsx          # 发票列表 (筛选 + 卡片)
│   ├── create/page.tsx   # 创建发票表单
│   └── [id]/page.tsx     # 发票详情
├── receipts/page.tsx     # 收据列表
└── audit/page.tsx        # 审计中心

components/
├── invoice-card.tsx      # 发票卡片组件
├── invoice-form.tsx      # 发票表单
├── function-guide.tsx    # 合约函数说明
├── wallet-connect-*.tsx  # 钱包连接按钮
└── ui/                   # shadcn 基础组件
```

### 2.2 问题诊断

#### 🔴 严重问题

| 问题 | 代码位置 | 影响 |
|------|----------|------|
| **Emoji 图标滥用** | 全局 (📊✏️📝🧾⏳✅❌) | 降低专业度，风格不统一 |
| **颜色对比度不足** | `bg-amber-50`, `border-amber-200` | 视觉层次模糊，难以聚焦 |
| **按钮样式混乱** | `bg-slate-900` vs `bg-amber-600` | 用户认知负担，交互不一致 |
| **无侧边导航** | `app/layout.tsx` 仅顶部导航 | 功能扩展受限，层级不清 |

#### 🟡 中等问题

| 问题 | 代码位置 | 影响 |
|------|----------|------|
| **系统默认字体** | `globals.css: font-family: system-ui` | 缺乏品牌识别度 |
| **无数据可视化** | `dashboard/page.tsx` 纯数字展示 | 信息密度低，洞察力不足 |
| **空状态设计简陋** | `📄 No sent invoices yet` | 用户引导不足 |
| **无加载骨架屏** | 列表加载时空白 | 体验割裂 |

#### 🟢 可优化项

| 问题 | 代码位置 | 影响 |
|------|----------|------|
| **无页面过渡动画** | 路由切换生硬 | 流畅感欠缺 |
| **表单无分步引导** | `audit/page.tsx` 表单 | 认知负担 |
| **无深色模式** | 固定浅色主题 | 用户偏好受限 |

### 2.3 现有代码亮点（保留）

- ✅ **Tailwind CSS 配置完善** - 已有 CSS 变量体系
- ✅ **shadcn/ui 已引入** - 可扩展高质量组件
- ✅ **响应式布局基础** - 使用 grid/flex 布局
- ✅ **状态管理规范** - Zustand stores 结构清晰
- ✅ **TypeScript 类型完整** - 类型定义良好

---

## 3. 品牌定位与设计方向

### 3.1 品牌核心概念

#### "The Trusted Alpaca" — 可信赖的羊驼

> Alpaca-Invoice 就像一只有责任心的"小羊驼会计"——**专业可靠，又平易近人**。

#### 品牌关键词

```
专业 Professional    |    温暖 Warm
可信 Trustworthy     |    友好 Friendly  
高效 Efficient       |    简洁 Clean
安全 Secure          |    现代 Modern
```

### 3.2 设计方向：Refined Professional（精致专业）

**选择理由**：
- 金融/发票类产品需要传达 **信任感** 和 **稳定性**
- Alpaca 主题允许适度 **亲和力** 但不能过于卡通
- 目标用户是 B2B 商务人士，需要 **效率优先** 的界面

**视觉基调**：
- 深色系（深靛蓝）提供专业基调
- 琥珀金点缀带来温暖活力
- 大量留白保持呼吸感
- 圆角元素传递亲和力

### 3.3 竞品参考分析

| 产品 | 主色 | 风格 | 可借鉴点 |
|------|------|------|----------|
| **Stripe Dashboard** | 紫蓝渐变 | 极简专业 | 数据卡片设计、清晰层级 |
| **QuickBooks** | 绿色 | 商务稳重 | 发票模板、状态标识 |
| **Xero** | 蓝色 | 现代清爽 | 侧边导航、图表展示 |
| **Linear** | 紫色 | 工程美学 | 键盘快捷键、微交互 |

---

## 4. 视觉规范系统

### 4.1 色彩系统

#### 主色板 (Primary Palette)

```css
/* 主色 - 深靛蓝 (信任、专业) */
--color-primary-50:  #EEF2FF;
--color-primary-100: #E0E7FF;
--color-primary-200: #C7D2FE;
--color-primary-300: #A5B4FC;
--color-primary-400: #818CF8;
--color-primary-500: #6366F1;  /* 主色 */
--color-primary-600: #4F46E5;
--color-primary-700: #4338CA;
--color-primary-800: #3730A3;
--color-primary-900: #312E81;
--color-primary-950: #1E1B4B;

/* 强调色 - 琥珀金 (温暖、活力) */
--color-accent-50:  #FFFBEB;
--color-accent-100: #FEF3C7;
--color-accent-200: #FDE68A;
--color-accent-300: #FCD34D;
--color-accent-400: #FBBF24;
--color-accent-500: #F59E0B;  /* 主强调色 */
--color-accent-600: #D97706;
--color-accent-700: #B45309;
--color-accent-800: #92400E;
--color-accent-900: #78350F;
```

#### 语义色板 (Semantic Colors)

```css
/* 成功 - 翠绿 */
--color-success-500: #10B981;
--color-success-100: #D1FAE5;

/* 警告 - 琥珀 */
--color-warning-500: #F59E0B;
--color-warning-100: #FEF3C7;

/* 错误 - 玫红 */
--color-error-500: #EF4444;
--color-error-100: #FEE2E2;

/* 信息 - 天蓝 */
--color-info-500: #3B82F6;
--color-info-100: #DBEAFE;
```

#### 中性色板 (Neutral Colors)

```css
/* 基于暖灰色调，呼应 Alpaca 毛色 */
--color-gray-50:  #FAFAF9;  /* 页面背景 */
--color-gray-100: #F5F5F4;  /* 卡片背景 */
--color-gray-200: #E7E5E4;  /* 边框 */
--color-gray-300: #D6D3D1;  /* 禁用边框 */
--color-gray-400: #A8A29E;  /* 占位符文字 */
--color-gray-500: #78716C;  /* 次要文字 */
--color-gray-600: #57534E;  /* 正文文字 */
--color-gray-700: #44403C;  /* 标题文字 */
--color-gray-800: #292524;  /* 强调文字 */
--color-gray-900: #1C1917;  /* 最深文字 */
```

#### 配色应用规则

| 场景 | 颜色 | 说明 |
|------|------|------|
| **主要按钮** | `primary-600` | 核心 CTA |
| **次要按钮** | `gray-100` + `gray-700` 文字 | 辅助操作 |
| **危险按钮** | `error-500` | 删除/取消 |
| **链接/强调** | `accent-500` | 吸引注意 |
| **侧边栏背景** | `primary-950` | 深色导航 |
| **页面背景** | `gray-50` | 减少眼疲劳 |
| **卡片背景** | `white` | 突出内容 |

### 4.2 字体系统

#### 字体选择

```css
/* 英文主字体 - Plus Jakarta Sans */
/* 特点：现代几何感、x-height 适中、专业但友好 */
--font-sans: 'Plus Jakarta Sans', 'Source Han Sans SC', 'Noto Sans SC', system-ui, sans-serif;

/* 数字/代码字体 - JetBrains Mono */
/* 特点：数字清晰可辨、等宽、技术感 */
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* 品牌标题字体 (可选) - Outfit */
/* 特点：圆润几何、适合大标题 */
--font-display: 'Outfit', 'Plus Jakarta Sans', sans-serif;
```

#### 字体层级

```css
/* 字号规范 */
--text-xs:   0.75rem;   /* 12px - 标签、徽章 */
--text-sm:   0.875rem;  /* 14px - 辅助文字、按钮 */
--text-base: 1rem;      /* 16px - 正文 */
--text-lg:   1.125rem;  /* 18px - 子标题 */
--text-xl:   1.25rem;   /* 20px - 卡片标题 */
--text-2xl:  1.5rem;    /* 24px - 页面标题 */
--text-3xl:  1.875rem;  /* 30px - 大标题 */
--text-4xl:  2.25rem;   /* 36px - Hero 标题 */

/* 字重规范 */
--font-normal:   400;  /* 正文 */
--font-medium:   500;  /* 强调正文 */
--font-semibold: 600;  /* 按钮、标题 */
--font-bold:     700;  /* 数字、品牌 */

/* 行高规范 */
--leading-tight:  1.25;  /* 标题 */
--leading-normal: 1.5;   /* 正文 */
--leading-relaxed: 1.75; /* 长文本 */
```

#### 字体应用示例

| 元素 | 字号 | 字重 | 颜色 |
|------|------|------|------|
| **页面标题** | `text-2xl` | `semibold` | `gray-900` |
| **卡片标题** | `text-lg` | `semibold` | `gray-800` |
| **正文** | `text-base` | `normal` | `gray-600` |
| **标签** | `text-xs` | `medium` | `gray-500` |
| **按钮** | `text-sm` | `semibold` | 取决于按钮类型 |
| **数字/金额** | `text-2xl` | `bold` | `gray-900` |
| **地址/哈希** | `text-xs` | `normal` | `gray-600` (mono) |

### 4.3 图标系统

#### 图标库选择：Lucide React

**选择理由**：
- 风格简洁、线条统一
- 与 shadcn/ui 完美集成
- 支持自定义 strokeWidth
- 社区活跃、图标丰富

#### 图标映射表（替换 Emoji）

| 功能 | 当前 Emoji | 替换为 Lucide | 使用场景 |
|------|------------|---------------|----------|
| 仪表盘 | 📊 | `LayoutDashboard` | 导航菜单 |
| 创建发票 | ✏️ | `FilePlus` | 按钮、导航 |
| 发票列表 | 📝 | `FileText` | 导航菜单 |
| 收据 | 🧾 | `Receipt` | 导航菜单 |
| 审计 | 🔍 | `ShieldCheck` | 导航菜单 |
| 待处理 | ⏳ | `Clock` | 状态标签 |
| 已支付 | ✅ | `CheckCircle` | 状态标签 |
| 已取消 | ❌ | `XCircle` | 状态标签 |
| 已过期 | ⚠️ | `AlertTriangle` | 状态标签 |
| 发送 | 📤 | `ArrowUpRight` | 统计卡片 |
| 接收 | 📥 | `ArrowDownLeft` | 统计卡片 |
| 钱包 | 💰 | `Wallet` | 钱包按钮 |
| 支付 | 💳 | `CreditCard` | 操作按钮 |
| Logo | 🧾 | 自定义 SVG | 品牌标识 |

#### 图标规范

```tsx
// 图标尺寸规范
const iconSizes = {
  xs: 14,   // 标签内图标
  sm: 16,   // 按钮内图标
  md: 20,   // 列表图标
  lg: 24,   // 导航图标
  xl: 32,   // 统计卡片图标
  '2xl': 48 // 空状态图标
};

// 图标颜色继承父元素
<Icon className="text-current" />

// 图标与文字间距
<Button>
  <Icon className="mr-2 h-4 w-4" />
  Label
</Button>
```

### 4.4 间距与布局

#### 间距系统

```css
/* 基于 4px 基准的间距 */
--space-0:  0;
--space-1:  0.25rem;  /* 4px */
--space-2:  0.5rem;   /* 8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-5:  1.25rem;  /* 20px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
```

#### 布局网格

```
桌面端 (≥1280px):
┌────────────────────────────────────────────────┐
│ 侧边导航 (256px)  │   主内容区 (flex-1)        │
│                   │ ┌──────────────────────┐   │
│ Logo              │ │ 页面标题 + 操作按钮  │   │
│ 主导航            │ ├──────────────────────┤   │
│ 辅助导航          │ │                      │   │
│ 用户信息          │ │   页面内容           │   │
│                   │ │   (max-w-7xl mx-auto)│   │
│                   │ │                      │   │
│                   │ └──────────────────────┘   │
└────────────────────────────────────────────────┘

平板端 (768px-1279px):
侧边导航收缩为图标模式 (72px)

移动端 (<768px):
侧边导航变为抽屉式
```

### 4.5 圆角与阴影

#### 圆角规范

```css
--radius-sm:  4px;   /* 小元素：标签、徽章 */
--radius-md:  8px;   /* 中等元素：按钮、输入框 */
--radius-lg:  12px;  /* 大元素：卡片 */
--radius-xl:  16px;  /* 特大元素：模态框 */
--radius-full: 9999px; /* 圆形：头像、状态点 */
```

#### 阴影规范

```css
/* 扁平化设计，阴影克制使用 */
--shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.1);
--shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.1);

/* 卡片悬浮效果 */
.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

---

## 5. 组件设计规范

### 5.1 按钮系统

#### 按钮变体

```tsx
// Primary - 主要操作
<Button variant="primary">
  <CreditCard className="mr-2 h-4 w-4" />
  Pay Invoice
</Button>
// 样式: bg-primary-600 text-white hover:bg-primary-700

// Secondary - 次要操作  
<Button variant="secondary">
  View Details
</Button>
// 样式: bg-gray-100 text-gray-700 hover:bg-gray-200

// Outline - 轮廓按钮
<Button variant="outline">
  <Download className="mr-2 h-4 w-4" />
  Export
</Button>
// 样式: border-gray-200 text-gray-700 hover:bg-gray-50

// Ghost - 幽灵按钮
<Button variant="ghost">
  Cancel
</Button>
// 样式: text-gray-600 hover:bg-gray-100

// Danger - 危险操作
<Button variant="danger">
  <XCircle className="mr-2 h-4 w-4" />
  Cancel Invoice
</Button>
// 样式: bg-error-500 text-white hover:bg-error-600

// Accent - 强调按钮 (用于 CTA)
<Button variant="accent">
  Create Invoice
</Button>
// 样式: bg-accent-500 text-white hover:bg-accent-600
```

#### 按钮尺寸

```tsx
// Small - 紧凑场景
<Button size="sm" className="h-8 px-3 text-xs" />

// Medium - 默认
<Button size="md" className="h-10 px-4 text-sm" />

// Large - 重要 CTA
<Button size="lg" className="h-12 px-6 text-base" />
```

#### 按钮状态

```css
/* 禁用状态 */
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 加载状态 */
.btn-loading {
  position: relative;
  color: transparent;
}
.btn-loading::after {
  content: '';
  position: absolute;
  /* 添加旋转 spinner */
}
```

### 5.2 卡片组件

#### 基础卡片

```tsx
<Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
  <CardHeader className="flex items-center justify-between">
    <CardTitle className="text-lg font-semibold text-gray-900">
      {title}
    </CardTitle>
    <Badge variant={status}>{statusLabel}</Badge>
  </CardHeader>
  <CardContent>
    {children}
  </CardContent>
  <CardFooter className="border-t border-gray-100 pt-4">
    {actions}
  </CardFooter>
</Card>
```

#### 发票卡片改进

```tsx
// 当前问题：Emoji、颜色混乱
// 改进后：

<InvoiceCard 
  invoice={invoice}
  className="group relative overflow-hidden"
>
  {/* 左侧状态条 */}
  <div className={cn(
    "absolute left-0 top-0 bottom-0 w-1",
    status === 'PENDING' && "bg-amber-400",
    status === 'PAID' && "bg-emerald-400",
    status === 'CANCELLED' && "bg-gray-400"
  )} />
  
  {/* 头部：ID + 状态 */}
  <div className="flex items-start justify-between mb-4">
    <div>
      <p className="text-xs text-gray-500 mb-1">Invoice ID</p>
      <code className="font-mono text-sm text-gray-900">
        {invoice.id.slice(0, 16)}...
      </code>
    </div>
    <StatusBadge status={status} />
  </div>
  
  {/* 金额突出显示 */}
  <div className="mb-4">
    <p className="text-xs text-gray-500 mb-1">Amount</p>
    <p className="text-2xl font-bold text-gray-900">
      {formatCredits(invoice.amount)}
      <span className="text-sm font-normal text-gray-500 ml-1">
        credits
      </span>
    </p>
  </div>
  
  {/* 详情网格 */}
  <div className="grid grid-cols-2 gap-3 text-sm mb-4">
    <InfoItem label="Buyer" value={truncateAddress(invoice.buyer)} />
    <InfoItem label="Due Date" value={formatDate(invoice.dueDate)} />
  </div>
  
  {/* 操作按钮 */}
  <div className="flex gap-2 pt-4 border-t border-gray-100">
    <Button variant="outline" size="sm" className="flex-1">
      View Details
    </Button>
    {canPay && (
      <Button variant="primary" size="sm" className="flex-1">
        <CreditCard className="mr-2 h-4 w-4" />
        Pay
      </Button>
    )}
  </div>
</InvoiceCard>
```

### 5.3 状态徽章

```tsx
// 替换 Emoji 为图标 + 统一样式

const StatusBadge = ({ status }: { status: InvoiceStatus }) => {
  const config = {
    PENDING: {
      icon: Clock,
      label: 'Pending',
      className: 'bg-amber-50 text-amber-700 border-amber-200'
    },
    PAID: {
      icon: CheckCircle,
      label: 'Paid',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    CANCELLED: {
      icon: XCircle,
      label: 'Cancelled',
      className: 'bg-gray-50 text-gray-600 border-gray-200'
    },
    EXPIRED: {
      icon: AlertTriangle,
      label: 'Expired',
      className: 'bg-red-50 text-red-700 border-red-200'
    }
  }[status];

  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
      "text-xs font-medium border",
      config.className
    )}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
};
```

### 5.4 表单组件

#### 输入框

```tsx
<div className="space-y-2">
  <Label htmlFor="buyer" className="text-sm font-medium text-gray-700">
    Buyer Address
  </Label>
  <div className="relative">
    <Input
      id="buyer"
      placeholder="aleo1..."
      className={cn(
        "h-11 rounded-lg border-gray-200 bg-white px-4",
        "text-sm text-gray-900 placeholder:text-gray-400",
        "focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20",
        "transition-colors"
      )}
    />
    {/* 可选：右侧图标 */}
    <Wallet className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
  </div>
  <p className="text-xs text-gray-500">
    Enter the recipient's Aleo wallet address
  </p>
</div>
```

### 5.5 数据表格

```tsx
// 用于发票列表的紧凑视图

<Table>
  <TableHeader>
    <TableRow className="bg-gray-50/50">
      <TableHead className="text-xs font-semibold text-gray-600">
        Invoice ID
      </TableHead>
      <TableHead>Amount</TableHead>
      <TableHead>Buyer</TableHead>
      <TableHead>Due Date</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {invoices.map((inv) => (
      <TableRow 
        key={inv.id}
        className="hover:bg-gray-50/50 cursor-pointer"
        onClick={() => navigateToDetail(inv.id)}
      >
        <TableCell className="font-mono text-sm">
          {inv.id.slice(0, 12)}...
        </TableCell>
        <TableCell className="font-semibold">
          {formatCredits(inv.amount)}
        </TableCell>
        <TableCell className="font-mono text-xs text-gray-600">
          {truncateAddress(inv.buyer)}
        </TableCell>
        <TableCell className="text-sm text-gray-600">
          {formatDate(inv.dueDate)}
        </TableCell>
        <TableCell>
          <StatusBadge status={inv.status} />
        </TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>View Details</DropdownMenuItem>
              <DropdownMenuItem>Copy ID</DropdownMenuItem>
              {inv.status === 'PENDING' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-error-600">
                    Cancel Invoice
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## 6. 页面重构方案

### 6.1 全局布局改造

#### 当前布局 (`app/layout.tsx`)

```
┌─────────────────────────────────────┐
│  Header (顶部导航)                   │
├─────────────────────────────────────┤
│                                     │
│  Main Content (无侧边栏)             │
│                                     │
├─────────────────────────────────────┤
│  Footer                              │
└─────────────────────────────────────┘
```

#### 目标布局

```
┌──────────┬──────────────────────────────────┐
│          │  Header (面包屑 + 搜索 + 用户)    │
│  Sidebar ├──────────────────────────────────┤
│          │                                  │
│  - Logo  │  Page Content                    │
│  - Nav   │  (带背景色区分)                   │
│  - User  │                                  │
│          │                                  │
└──────────┴──────────────────────────────────┘
```

#### 侧边栏设计

```tsx
// components/layout/Sidebar.tsx

const Sidebar = () => {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-primary-950">
      {/* Logo 区域 */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-primary-900">
        <AlpacaLogo className="h-8 w-8" />
        <span className="text-lg font-bold text-white">
          ZK-Invoice
        </span>
      </div>
      
      {/* 主导航 */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        <NavItem href="/dashboard" icon={LayoutDashboard}>
          Dashboard
        </NavItem>
        <NavItem href="/invoices" icon={FileText}>
          Invoices
        </NavItem>
        <NavItem href="/invoices/create" icon={FilePlus}>
          Create Invoice
        </NavItem>
        <NavItem href="/receipts" icon={Receipt}>
          Receipts
        </NavItem>
        <NavItem href="/audit" icon={ShieldCheck}>
          Audit Center
        </NavItem>
      </nav>
      
      {/* 底部用户信息 */}
      <div className="border-t border-primary-900 p-4">
        <WalletInfo />
      </div>
    </aside>
  );
};

const NavItem = ({ href, icon: Icon, children, isActive }) => (
  <Link
    href={href}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium",
      "transition-colors",
      isActive 
        ? "bg-primary-800 text-white" 
        : "text-primary-300 hover:bg-primary-900 hover:text-white"
    )}
  >
    <Icon className="h-5 w-5" />
    {children}
  </Link>
);
```

### 6.2 首页改造 (`app/page.tsx`)

#### 当前问题
- Hero 区域信息密度低
- 快捷操作使用 Emoji
- 无视觉冲击力

#### 改造方案

```tsx
// 首页改造为简洁的 Landing + 快速入口

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-primary-950">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl" />
        
        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="max-w-2xl">
            {/* 品牌标识 */}
            <div className="flex items-center gap-3 mb-8">
              <AlpacaLogo className="h-12 w-12" />
              <span className="text-2xl font-bold text-white">ZK-Invoice</span>
            </div>
            
            {/* 标题 */}
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
              Privacy-First
              <span className="block text-accent-400">Invoice System</span>
            </h1>
            
            {/* 副标题 */}
            <p className="text-lg text-primary-200 mb-8 leading-relaxed">
              Built on Aleo zero-knowledge proofs. Protect your business 
              confidentiality while maintaining full audit capability.
            </p>
            
            {/* CTA 按钮 */}
            <div className="flex flex-wrap gap-4">
              <WalletConnectButton size="lg" />
              <Button variant="outline" size="lg" className="border-primary-700 text-white hover:bg-primary-800">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>
      
      {/* 特性卡片 */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={Lock}
            title="Complete Privacy"
            description="Transaction details visible only to authorized parties"
          />
          <FeatureCard
            icon={Zap}
            title="Instant Settlement"
            description="Second-level finality on Aleo blockchain"
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Audit Ready"
            description="Selective disclosure via View Key mechanism"
          />
        </div>
      </section>
    </div>
  );
}
```

### 6.3 仪表盘改造 (`app/dashboard/page.tsx`)

#### 当前问题
- 统计卡片使用 Emoji
- 无图表可视化
- 发票列表和首页重复

#### 改造方案

```tsx
export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of your invoice activity
          </p>
        </div>
        <Button>
          <FilePlus className="mr-2 h-4 w-4" />
          Create Invoice
        </Button>
      </div>
      
      {/* 统计卡片 - 使用图标替代 Emoji */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Sent"
          value={stats.totalSent}
          change="+12%"
          trend="up"
          icon={ArrowUpRight}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Total Received"
          value={stats.totalReceived}
          change="+5%"
          trend="up"
          icon={ArrowDownLeft}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          highlight
        />
        <StatCard
          title="Total Volume"
          value={formatCredits(stats.volume)}
          suffix="credits"
          icon={TrendingUp}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
        />
      </div>
      
      {/* 图表区域 - 新增 */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* 7天趋势图 */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Invoice Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceActivityChart data={chartData} />
          </CardContent>
        </Card>
        
        {/* 状态分布饼图 */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusPieChart data={statusData} />
          </CardContent>
        </Card>
      </div>
      
      {/* 最近发票 - 紧凑表格视图 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Recent Invoices
          </CardTitle>
          <Link href="/invoices" className="text-sm text-primary-600 hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          <InvoiceTable invoices={recentInvoices.slice(0, 5)} compact />
        </CardContent>
      </Card>
    </div>
  );
}
```

### 6.4 发票列表页改造 (`app/invoices/page.tsx`)

#### 改造要点

1. **双视图切换**：卡片视图 / 表格视图
2. **高级筛选**：状态、日期范围、金额范围
3. **批量操作**：多选 + 批量同步
4. **空状态插画**：替代简单 Emoji

```tsx
export default function InvoicesPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your sent and received invoices
          </p>
        </div>
        <Button>
          <FilePlus className="mr-2 h-4 w-4" />
          Create Invoice
        </Button>
      </div>
      
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-4">
        {/* 状态筛选 Tabs */}
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="bg-gray-100 p-1 rounded-lg">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">
              Pending
              <Badge className="ml-2" variant="warning">{pendingCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex-1" />
        
        {/* 搜索 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search invoices..." 
            className="pl-10 w-64"
          />
        </div>
        
        {/* 视图切换 */}
        <div className="flex rounded-lg border border-gray-200 p-1">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        
        {/* 同步按钮 */}
        <Button variant="outline" onClick={handleSyncAll}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
          Sync All
        </Button>
      </div>
      
      {/* 内容区域 */}
      {filteredInvoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="Create your first invoice to get started"
          action={
            <Button>
              <FilePlus className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredInvoices.map(({ invoice, role }) => (
            <InvoiceCard key={invoice.id} invoice={invoice} role={role} />
          ))}
        </div>
      ) : (
        <InvoiceTable invoices={filteredInvoices} />
      )}
    </div>
  );
}
```

### 6.5 创建发票页改造 (`app/invoices/create/page.tsx`)

#### 改造要点

1. **分步表单向导**（可选）
2. **实时预览**
3. **表单验证优化**
4. **进度指示器改进**

```tsx
export default function CreateInvoicePage() {
  return (
    <div className="max-w-2xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <Link 
          href="/invoices" 
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create Invoice</h1>
        <p className="text-sm text-gray-500 mt-1">
          Fill in the details to create a new privacy-preserving invoice
        </p>
      </div>
      
      {/* 表单卡片 */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 卖家信息 (只读) */}
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
              <Label className="text-xs text-gray-500 mb-1 block">
                Seller (You)
              </Label>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-600" />
                </div>
                <code className="text-sm font-mono text-gray-900">
                  {publicKey ? `${publicKey.slice(0, 12)}...${publicKey.slice(-8)}` : 'Not connected'}
                </code>
              </div>
            </div>
            
            {/* 买家地址 */}
            <FormField label="Buyer Address" required>
              <Input
                placeholder="aleo1..."
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
                className="font-mono"
              />
              <FormDescription>
                Enter the Aleo wallet address of the invoice recipient
              </FormDescription>
            </FormField>
            
            {/* 金额 */}
            <FormField label="Amount" required>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pr-20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  credits
                </span>
              </div>
            </FormField>
            
            {/* 描述 */}
            <FormField label="Description">
              <Textarea
                placeholder="Invoice description or notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </FormField>
            
            {/* 到期日期 */}
            <FormField label="Due Date" required>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </FormField>
            
            {/* 进度显示 */}
            {isProcessing && (
              <div className="p-4 rounded-lg bg-primary-50 border border-primary-100">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="h-5 w-5 text-primary-600 animate-spin" />
                  <span className="text-sm font-medium text-primary-900">
                    Processing...
                  </span>
                </div>
                <Progress value={currentProgress} className="h-2" />
                <p className="text-xs text-primary-700 mt-2">{currentLog}</p>
              </div>
            )}
            
            {/* 提交按钮 */}
            <Button 
              type="submit" 
              className="w-full" 
              size="lg"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Invoice...
                </>
              ) : (
                <>
                  <FilePlus className="mr-2 h-4 w-4" />
                  Create Invoice
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 7. 交互与动效规范

### 7.1 页面过渡动画

```tsx
// 使用 Framer Motion 实现页面过渡

// components/layout/PageTransition.tsx
import { motion } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

export const PageTransition = ({ children }) => (
  <motion.div
    initial="initial"
    animate="enter"
    exit="exit"
    variants={pageVariants}
    transition={{ duration: 0.3, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);
```

### 7.2 列表动画

```tsx
// 列表项渐显动画

const listVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

<motion.div variants={listVariants} initial="hidden" animate="show">
  {invoices.map((invoice) => (
    <motion.div key={invoice.id} variants={itemVariants}>
      <InvoiceCard invoice={invoice} />
    </motion.div>
  ))}
</motion.div>
```

### 7.3 微交互

```css
/* 按钮点击反馈 */
.btn {
  transition: transform 0.1s ease, box-shadow 0.2s ease;
}
.btn:active {
  transform: scale(0.98);
}

/* 卡片悬停 */
.card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

/* 输入框聚焦 */
.input {
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.input:focus {
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px var(--color-primary-500 / 0.1);
}
```

### 7.4 加载状态

```tsx
// 骨架屏组件
const InvoiceCardSkeleton = () => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 animate-pulse">
    <div className="flex items-start justify-between mb-4">
      <div className="space-y-2">
        <div className="h-3 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
      <div className="h-6 w-20 bg-gray-200 rounded-full" />
    </div>
    <div className="space-y-3">
      <div className="h-8 w-24 bg-gray-200 rounded" />
      <div className="h-3 w-full bg-gray-200 rounded" />
      <div className="h-3 w-2/3 bg-gray-200 rounded" />
    </div>
  </div>
);

// 使用
{isLoading ? (
  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <InvoiceCardSkeleton key={i} />
    ))}
  </div>
) : (
  <InvoiceList invoices={invoices} />
)}
```

### 7.5 Toast 通知

```tsx
// 使用 sonner 的改进样式

<Toaster
  position="top-right"
  toastOptions={{
    classNames: {
      toast: 'bg-white border border-gray-200 shadow-lg rounded-xl',
      title: 'text-gray-900 font-semibold',
      description: 'text-gray-600',
      success: 'border-emerald-200 bg-emerald-50',
      error: 'border-red-200 bg-red-50',
      loading: 'border-primary-200 bg-primary-50',
    },
  }}
/>

// 使用示例
toast.success('Invoice created successfully', {
  description: 'Transaction ID: at1abc123...',
  action: {
    label: 'View',
    onClick: () => router.push(`/invoices/${id}`)
  }
});
```

---

## 8. 文案规范

### 8.1 语言风格

| 原则 | 说明 | 示例 |
|------|------|------|
| **简洁** | 避免冗余词汇 | ❌ "Click here to create" → ✅ "Create Invoice" |
| **主动** | 使用主动语态 | ❌ "Invoice was created" → ✅ "Invoice created" |
| **友好** | 避免技术术语 | ❌ "Transaction failed" → ✅ "Something went wrong. Please try again." |
| **一致** | 统一术语 | 统一使用 "Invoice" 而非混用 "Bill" |

### 8.2 关键文案改进

#### 页面标题

| 当前 | 改进后 |
|------|--------|
| Invoice manager | Invoices |
| Create invoice | Create Invoice |
| Invoice detail | Invoice Details |
| Audit Center | Audit Center |

#### 按钮文案

| 当前 | 改进后 |
|------|--------|
| Create invoice | Create Invoice |
| View Details | View Details |
| 💳 Pay | Pay Invoice |
| ❌ Cancel | Cancel Invoice |
| Sync All | Sync Status |

#### 空状态文案

| 场景 | 标题 | 描述 | 操作 |
|------|------|------|------|
| 无发票 | No invoices yet | Create your first invoice to start tracking payments | Create Invoice |
| 无收据 | No receipts yet | Receipts will appear here after invoices are paid | — |
| 搜索无结果 | No results found | Try adjusting your search or filters | Clear Filters |
| 网络错误 | Connection error | We couldn't load your data. Please try again. | Retry |

#### 状态提示

| 场景 | 文案 |
|------|------|
| 创建中 | Creating invoice... |
| 创建成功 | Invoice created successfully |
| 支付中 | Processing payment... |
| 支付成功 | Payment completed |
| 同步中 | Syncing with blockchain... |
| 同步完成 | Status updated |

### 8.3 错误信息改进

| 当前 | 改进后 |
|------|--------|
| Wallet not connected | Please connect your wallet to continue |
| Transaction failed | Transaction couldn't be completed. Please try again. |
| Invoice not found | This invoice doesn't exist or has been removed |
| Insufficient balance | You don't have enough credits for this transaction |

---

## 9. 技术实施方案

### 9.1 依赖更新

```bash
# 新增依赖
npm install framer-motion        # 动画库
npm install @radix-ui/react-tabs # Tabs 组件
npm install recharts             # 图表库 (已有)
npm install lucide-react         # 图标库

# 字体
# 在 app/layout.tsx 中引入 Google Fonts
```

### 9.2 字体配置

```tsx
// app/layout.tsx
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export default function RootLayout({ children }) {
  return (
    <html className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
```

### 9.3 Tailwind 配置更新

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        // 强调色
        accent: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

### 9.4 新增组件清单

| 组件 | 路径 | 优先级 |
|------|------|--------|
| Sidebar | `components/layout/Sidebar.tsx` | P0 |
| StatCard | `components/dashboard/StatCard.tsx` | P0 |
| StatusBadge | `components/ui/StatusBadge.tsx` | P0 |
| EmptyState | `components/ui/EmptyState.tsx` | P1 |
| InvoiceTable | `components/invoice/InvoiceTable.tsx` | P1 |
| PageTransition | `components/layout/PageTransition.tsx` | P2 |
| Skeleton | `components/ui/Skeleton.tsx` | P2 |
| AlpacaLogo | `components/brand/AlpacaLogo.tsx` | P1 |

### 9.5 文件结构调整

```
components/
├── brand/
│   ├── AlpacaLogo.tsx        # 品牌 Logo
│   └── Wordmark.tsx          # 文字标识
├── layout/
│   ├── Sidebar.tsx           # 侧边导航
│   ├── Header.tsx            # 顶部栏
│   ├── PageTransition.tsx    # 页面过渡
│   └── AppShell.tsx          # 布局容器
├── dashboard/
│   ├── StatCard.tsx          # 统计卡片
│   ├── ActivityChart.tsx     # 活动图表
│   └── StatusPieChart.tsx    # 状态饼图
├── invoice/
│   ├── InvoiceCard.tsx       # 发票卡片 (重构)
│   ├── InvoiceTable.tsx      # 发票表格
│   ├── InvoiceForm.tsx       # 创建表单 (重构)
│   └── InvoiceDetail.tsx     # 详情视图
├── ui/
│   ├── StatusBadge.tsx       # 状态徽章
│   ├── EmptyState.tsx        # 空状态
│   ├── Skeleton.tsx          # 骨架屏
│   └── ... (shadcn 组件)
└── wallet/
    ├── WalletConnect.tsx     # 钱包连接
    └── WalletInfo.tsx        # 钱包信息
```

---

## 10. 实施路线图

### Phase 1: 基础设施 (Week 1)

| 任务 | 优先级 | 预估工时 |
|------|--------|----------|
| 配置新色彩系统 | P0 | 2h |
| 配置字体系统 | P0 | 1h |
| 创建 Sidebar 组件 | P0 | 4h |
| 修改全局布局 | P0 | 3h |
| 替换所有 Emoji 为 Lucide 图标 | P0 | 4h |
| 创建 StatusBadge 组件 | P0 | 2h |

**交付物**: 新布局框架 + 统一图标系统

### Phase 2: 核心页面 (Week 2)

| 任务 | 优先级 | 预估工时 |
|------|--------|----------|
| 重构仪表盘页面 | P0 | 6h |
| 添加统计图表 | P1 | 4h |
| 重构发票列表页 | P0 | 6h |
| 添加表格视图 | P1 | 4h |
| 重构发票卡片组件 | P0 | 4h |

**交付物**: Dashboard + Invoices 页面焕新

### Phase 3: 表单与详情 (Week 3)

| 任务 | 优先级 | 预估工时 |
|------|--------|----------|
| 重构创建发票表单 | P0 | 4h |
| 重构发票详情页 | P0 | 4h |
| 重构收据页面 | P1 | 3h |
| 重构审计页面 | P1 | 3h |
| 添加空状态组件 | P1 | 2h |

**交付物**: 所有业务页面完成重构

### Phase 4: 动效与体验 (Week 4)

| 任务 | 优先级 | 预估工时 |
|------|--------|----------|
| 添加页面过渡动画 | P2 | 3h |
| 添加列表渐显动画 | P2 | 2h |
| 添加骨架屏加载 | P2 | 3h |
| 优化 Toast 样式 | P2 | 1h |
| 添加微交互 | P2 | 2h |
| 首页重设计 | P1 | 4h |

**交付物**: 完整的动效体验 + Landing Page

### Phase 5: 品牌与打磨 (Week 5)

| 任务 | 优先级 | 预估工时 |
|------|--------|----------|
| 设计 Alpaca Logo | P1 | 4h |
| 添加品牌元素 | P1 | 2h |
| 响应式适配检查 | P1 | 3h |
| 无障碍检查 | P2 | 2h |
| 文档整理 | P2 | 2h |

**交付物**: 完整品牌视觉 + 生产就绪

---

## 附录

### A. 参考资源

- **TailAdmin**: https://tailadmin.com/
- **Lucide Icons**: https://lucide.dev/
- **shadcn/ui**: https://ui.shadcn.com/
- **Framer Motion**: https://www.framer.com/motion/

### B. 设计灵感

- Stripe Dashboard
- Linear App
- Vercel Dashboard
- Notion

### C. 文档版本历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0 | 2026-01-19 | 初始版本 |

---

*本文档为 Alpaca-Invoice 前端重构的完整设计规范，请在实施过程中持续参考并根据实际情况调整。*