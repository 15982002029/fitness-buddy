#!/bin/bash
# Personal OS · SessionStart hook
# 会话开始时把项目状态注入上下文（stdout 会作为 additionalContext 提供给 Claude）。
# 只读，不修改任何文件，不联网。
set -u
DIR="${CLAUDE_PROJECT_DIR:-.}"
cd "$DIR" 2>/dev/null || exit 0
[ -f .personal-os/HANDOFF.md ] || exit 0

state=$(grep -m1 '^状态：' .personal-os/HANDOFF.md | sed 's/^状态：//' | tr -d '[:space:]')

echo "=== Personal OS 状态恢复（SessionStart hook 自动注入）==="
echo "HANDOFF 状态：${state:-未知}"
echo ""
if [ "$state" = "READY" ] || [ "$state" = "IN_PROGRESS" ]; then
  echo "--- 当前 ACTIVE HANDOFF（已确认执行任务，按 CLAUDE.md 协议执行）---"
  cat .personal-os/HANDOFF.md
else
  echo "（无 ACTIVE handoff：探索、建议与候选主线都不构成执行授权）"
fi
echo ""
echo "--- STATUS.md ---"
cat .personal-os/STATUS.md 2>/dev/null | head -50
echo ""
echo "--- 最近一条 WORKLOG ---"
awk '/^## /{n++} n==1' .personal-os/WORKLOG.md 2>/dev/null | head -20
echo "=== 恢复结束。开始工作前先读 CLAUDE.md 协议；重要改动完成前必须回写 STATUS 与 WORKLOG ==="
exit 0
