Alpaca Invoice — Wave 2 Update (current state)

🦙 状态快照  
  • 合约：zk_invoice_v2_2.aleo（testnet，tx at13cmxw90rn5xux4gj7xejyz7jlc5yc7ugkjl8hv7rdgqp4l7uwcfq87ps78）  
  • 审计包：envelope v2.2.0，支持链锚定（需 commitment_root 存链），五阶段校验  
  • 审计授权：seller-only，set_audit_authorization；检测 spent record，避免钱包 “Unspent record not found”  
  • 前端：详情页 BigInt 渲染修复；审核按钮阻止已花费记录；链锚定缺 root 时快速失败提示  
  • 文档/测试：README、USER_TEST_GUIDE、docs/API_AUDIT_PACKAGE、tests 文档均同步到 v2.2.0 流程

🦙 我们解决的坑（Wave2 交付后续迭代）  
  • 审计包链锚定必需条件不明确 → 明确需要 commitment_root，否则提示并中断生成  
  • 授权交易直接撞到 spent record → 加入 spent 校验，提示用户记录已支付/取消  
  • BigInt 直接 JSON.stringify 崩溃 → 统一字符串化渲染 anchors  
  • 验证 Phase3 解析错误 → audit_authorization 支持 Leo struct 字符串解析

🦙 仍需关注  
  • 链上 commitment_root 缺失时的用户指引：需要更友好的再试或重建路径  
  • chain-anchored 发票的创建/同步流程自动化（避免手工判断 nonce/root）  
  • 旧版包兼容性：invoice_id ≠ invoice_hash 的历史包提示与修复策略

🦙 验收清单（现状）  
  • 创建/支付/取消：✅  
  • 映射轮询与钱包less /verify：✅  
  • 审计包生成（本地+链锚定）：✅（链根缺失会提示失败）  
  • set_audit_authorization：✅（仅卖家 + 未花费记录）  
  • 审计五阶段校验：✅（含授权、anchors、R1–R5）  
  • 文档与测试指南：✅（对齐 v2.2.0）

🦙 下一步提案  
  • 自动检测并提示补全 commitment_root（例如后台轮询或重试按钮）  
  • 对历史发票提供“重生成并写 root”工具，减少链锚定缺口  
  • UI 提示优化：明确展示记录是否已花费、是否具备链根、授权状态
