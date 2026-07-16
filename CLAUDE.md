# Claude Code 协作说明

这是西西 Personal OS 管理的项目。

## 开始工作前

按顺序读取：

1. `.personal-os/HANDOFF.md`
2. `.personal-os/STATUS.md`
3. 与 handoff 直接有关的项目文档和代码

只有 HANDOFF 状态为 `READY` 或 `IN_PROGRESS` 时，才把其中任务视为已确认执行任务。探索想法、推荐下一步和候选主线都不是授权。

## 执行原则

- 保留任务的原始意图、为什么现在做、约束、已否决方向和验收标准。
- 不把头脑风暴或执行中发现自动升级为新主线。
- 不顺手增加功能；额外发现进入记录，等待西西判断。
- 先检查已有改动，保护用户工作。
- 修改后运行与风险相称的验证。
- 不提交密钥、令牌或未经脱敏的 transcript。

## 自动闭环（lifecycle hooks，v0.2）

本仓库 `.claude/settings.json` 配置了两个项目级 hooks（脚本在 `.claude/hooks/`，均为只读检查，不写文件、不推送、不上传对话内容）：

- **SessionStart**：自动把 HANDOFF 状态、STATUS 摘要和最近一条 WORKLOG 注入上下文——无需手动"先读取状态文件"。
- **Stop**：存在 ACTIVE handoff 且本轮有实际文件改动但 `.personal-os/` 未回写时，拦截一次并提醒完成回写（STATUS/WORKLOG/HANDOFF）；纯问答轮、已回写、或第二次停止不拦。

hooks 修改后需重启会话或运行 `/hooks` 重载才生效。

## 推送纪律

- `.personal-os/`、文档与协议类改动：完成回写后可直接提交推送。
- **应用代码（app/、data/ 等）：推送前需西西确认**；hooks 永远不会自动推送任何内容。

## 完成前必须回写

- 更新 `.personal-os/STATUS.md`：实际状态、证据、阻塞和最近验证节点。
- 追加 `.personal-os/WORKLOG.md`：任务、实际完成、验证、偏离、阻塞和建议。
- 将 HANDOFF 状态改为 `DONE` 或 `BLOCKED`。
- 最终回复列出改动与验证证据；不能只说“完成”。

中央上下文仓库：https://github.com/15982002029/personal-context-system
