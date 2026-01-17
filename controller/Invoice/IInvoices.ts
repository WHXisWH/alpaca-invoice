import { AleoField, Invoice } from "@/lib/types";

/**
 * IInvoices Controller 接口
 * 发票列表页的业务逻辑控制器
 */
export interface IInvoices {
  // --- 状态暴露 ---
  /** 过滤后的发票列表（包含角色信息） */
  filteredInvoices: Array<{
    invoice: Invoice;
    role: 'SELLER' | 'BUYER' | 'BOTH';
  }>;
  
  /** 当前过滤状态 */
  filter: 'all' | 'pending' | 'paid' | 'cancelled';
  
  /** 搜索关键词 */
  search: string;
  
  /** 是否需要授权（masterKey不存在） */
  isAuthRequired: boolean;
  
  /** 是否正在加载 */
  isLoading: boolean;
  
  /** 是否已就绪（初始化完成） */
  isReady: boolean;

  /** 是否显示授权遮罩（业务逻辑判断） */
  showAuthModal: boolean;
  
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
  
  /** 处理用户点击解锁 */
  handleUnlock: () => Promise<void>;
  
  /** 刷新发票列表（重新初始化） */
  refresh: () => Promise<void>;
}
