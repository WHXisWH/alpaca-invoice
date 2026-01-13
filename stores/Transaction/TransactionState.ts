export interface TransactionState {
  isProcessing: boolean;
  stage: 'IDLE' | 'HASHING' | 'PROVING' | 'BROADCASTING' | 'CONFIRMING';
  progress: number;                 // 0-100
  logs: string[];                   // 实时日志流
  error: string | null;             // 捕获的异常信息
  
  // Actions
  startTx: (stage: TransactionState['stage']) => void;
  updateProgress: (progress: number, log?: string) => void;
  completeTx: () => void;
  setError: (msg: string) => void;
}