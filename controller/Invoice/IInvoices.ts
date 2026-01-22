import { AleoField, Invoice } from "@/lib/types";
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';

/**
 * 发票状态配置
 */
export interface StatusConfig {
  label: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}

/**
 * IInvoices Controller 接口
 * 发票列表页的业务逻辑控制器
 */
export interface IInvoices {
  // --- 数据 ---
  /** 过滤后的发票列表（包含角色、链上状态、状态配置） */
  filteredInvoices: Array<{
    invoice: Invoice;
    role: 'SELLER' | 'BUYER' | 'BOTH';
    chainStatus: ChainConfirmationStatus;  // ✅ 新增：链上确认状态
    statusConfig: StatusConfig;            // ✅ 新增：状态配置
  }>;
  
  // --- 状态 ---
  /** 当前过滤状态 */
  filter: 'all' | 'pending' | 'paid' | 'cancelled';
  
  /** 搜索关键词 */
  search: string;
  
  /** 是否正在加载 */
  isLoading: boolean;

  /** 是否正在同步状态 */
  isSyncing: boolean;

  // --- UI 状态判断 ---
  /** 是否显示加载状态（业务逻辑判断） */
  showLoading: boolean;
  
  /** 是否显示钱包连接提示（业务逻辑判断） */
  showWalletPrompt: boolean;
  
  /** 是否显示主内容（业务逻辑判断） */
  showMainContent: boolean;

  // --- 业务方法 ---
  /** 设置过滤状态 */
  setFilter: (filter: 'all' | 'pending' | 'paid' | 'cancelled') => void;
  
  /** 设置搜索关键词 */
  setSearch: (search: string) => void;
  
  /** 刷新发票列表（重新初始化） */
  refresh: () => Promise<void>;

  /** 从链上同步所有发票的最新状态 */
  handleSyncAll: () => Promise<void>;

  /** 处理支付发票（买家操作） */
  handlePay: (invoice: Invoice) => Promise<void>;

  /** 处理取消发票（卖家操作） */
  handleCancel: (invoice: Invoice) => Promise<void>;

  /** 检查发票是否正在处理（支付/取消中） */
  isInvoiceProcessing: (invoiceId: string) => boolean;

  /** 检查发票是否正在同步（轮询中） */
  isInvoiceSyncing: (invoice: Invoice) => boolean;
}
