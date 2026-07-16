#!/bin/bash
# Personal OS · Stop hook
# Claude 结束回复前的回写检查：只在「存在 ACTIVE handoff 且本轮有实际改动但
# .personal-os 未回写」时拦一次，提醒完成 STATUS/WORKLOG/HANDOFF 回写。
# 只读检查 + 输出提醒，不写文件、不推送、不把对话内容写入任何地方。
set -u
input=$(cat 2>/dev/null || true)

# 防死循环：因本 hook 而继续过一次后，无条件放行
case "$input" in *'"stop_hook_active":true'*) exit 0;; esac

DIR="${CLAUDE_PROJECT_DIR:-.}"
cd "$DIR" 2>/dev/null || exit 0
[ -f .personal-os/HANDOFF.md ] || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

state=$(grep -m1 '^状态：' .personal-os/HANDOFF.md | sed 's/^状态：//' | tr -d '[:space:]')
case "$state" in READY|IN_PROGRESS) ;; *) exit 0;; esac

changes=$(git status --porcelain 2>/dev/null)
# 工作区没有任何改动（纯问答/探索轮）→ 放行
[ -z "$changes" ] && exit 0

# 有 .personal-os 之外的改动，但 .personal-os 没被一起改 → 提醒回写
if echo "$changes" | grep -qv '\.personal-os/' && ! echo "$changes" | grep -q '\.personal-os/'; then
  printf '%s' '{"decision":"block","reason":"Personal OS 回写检查：存在 ACTIVE handoff 且本轮有实际文件改动，但 .personal-os/ 尚未回写。请在结束前按 CLAUDE.md 完成：1) 更新 STATUS.md（实际状态/证据/阻塞）；2) 追加 WORKLOG.md；3) 任务完成则把 HANDOFF 状态改为 DONE（阻塞则 BLOCKED）。注意：不要把敏感对话原文写入这些文件；推送应用代码需西西确认。若本轮改动确实无需回写（如临时实验），说明原因后正常结束即可。"}'
  exit 0
fi
exit 0
