# 当前执行交接

状态：DONE
创建时间：2026-07-18（UTC+8）
完成时间：2026-07-19（UTC+8）
完成说明：`research/git-fit-competitive-review.md` 已新增，11 章节齐备，7 个必须问题已逐条回答；STATUS 与 WORKLOG 已回写。一处偏离：HANDOFF 列出的官网来源 git-fit.app 在执行环境 DNS NXDOMAIN 不可达，相关条目已降级为「未独立复核的产品方主张」而非删除或猜测，详见 WORKLOG 2026-07-19 条目。
来源：西西在 ChatGPT 中明确授权“创建 Git-Fit 对比任务”
执行端：Claude Code
任务类型：只读竞品审查与验证准备，不代表项目主线确认

## 任务

对 Git-Fit 与 fitness-buddy 做一次基于公开一手证据的竞品审查，判断两者的真实重叠、可验证差异和下一步最小验证实验。

最终新增：

`research/git-fit-competitive-review.md`

并按 Personal OS 协议回写 HANDOFF、STATUS 与 WORKLOG，提交并 push 到 GitHub。

## 为什么现在做

fitness-buddy 已可由西西本人使用，但尚未开始外部用户验证，且西西当前没有符合条件的熟人测试候选者。

2026-07-18 发现 Git-Fit 与 fitness-buddy 高度相似：两者都面向 AI coding / 长时间电脑工作的 macOS 用户，都试图把 AI 等待间隙转化为短时活动。公开招募前必须先判断 fitness-buddy 是否存在用户真正关心的差异，避免在差异不清楚时继续开发或传播。

## 已知一手来源

- Git-Fit 官网：https://www.git-fit.app/
- Git-Fit GitHub：https://github.com/rebelchris/git-fit
- Git-Fit Releases：https://github.com/rebelchris/git-fit/releases
- fitness-buddy README：本仓库 README.md
- fitness-buddy 当前任务：本仓库 NOW.md
- fitness-buddy 验证计划：本仓库 docs/04-validation-plan.md
- fitness-buddy 实现：本仓库 app/、data/、package.json

## 已确认事实

### fitness-buddy

- Electron v0.1.2，Apple Silicon DMG/zip。
- 灵狐桌宠常驻、拖动、贴边收纳。
- “提醒到期 + 自然停顿”触发；用户打字时提醒收起。
- 零系统权限。
- 23 个办公室微运动。
- 首次问卷、设置、今日数据和 7 天统计。
- 本人可用，外部 3–5 人 × 3 天验证尚未开始。

### Git-Fit

- macOS 菜单栏应用。
- 公开定位是检测 AI coding 等待并触发 20–60 秒微运动。
- 官网写明检测 Cursor、Claude、Copilot 等。
- v1.3.0 Release 说明使用进程 / CPU 活动减少空闲进程误触发。
- 支持 Homebrew 与 DMG。
- 安装说明要求辅助功能权限。
- 2026-07-18 公开 GitHub 页面显示 4 个 Releases、约 39 stars、1 fork。
- 官网写有“12,847 developers”，但该数字未经独立验证，只能标为产品方主张。

## 必须回答的问题

1. Git-Fit 是否是 fitness-buddy 的直接替代品？重叠到什么程度？
2. 两者在触发逻辑、权限、隐私、交互形态、动作内容、统计、安装分发和目标用户上的事实差异是什么？
3. 哪些差异可能对用户有意义，哪些只是开发者自我感觉或尚无证据的功能差异？
4. fitness-buddy 的灵狐桌宠、零权限、自然停顿与打字即收起，分别需要怎样验证？
5. Git-Fit 的活跃度、发布节奏、仓库可见性、安装摩擦和公开市场证据分别是什么？
6. 在不继续开发的前提下，下一项最小验证实验是什么？
7. 基于现有证据，给出“继续差异化验证 / 调整定位 / 暂停”的建议，但不得自动改变项目主线。

## 研究规范

- 优先使用官网、GitHub 仓库、Release、README、代码和官方文档等一手来源。
- 每项关键结论附 URL、访问日期和证据位置。
- 明确区分：
  - 可核验事实；
  - 产品方自述或营销主张；
  - 基于证据的推断；
  - 当前未知。
- 如果来源冲突，保留冲突并说明。
- 不使用搜索摘要替代正文证据。
- 不把 stars、官网数字或宣传文案直接等同于真实用户量、留存或收入。
- 不复制 Git-Fit 的代码、动作库、文案或视觉资产。

## 安全与执行约束

- 不安装或运行 Git-Fit。
- 不下载其 DMG 或其他二进制。
- 不授予辅助功能、录屏、自动化或其他系统权限。
- 不登录外部网站，不发布帖子，不联系作者或用户。
- 不修改 fitness-buddy 的 app/、data/、assets/、package.json 或任何产品代码。
- 不新增功能，不修复顺手发现的问题。
- 不改变 docs/04-validation-plan.md 的验证标准。
- 不把 fitness-buddy 自动写成主线，也不因为竞品存在自动宣布项目失败。
- 保护西西已有未提交改动。
- 遇到无法从公开一手来源确认的事项，标为未知，不猜测。

## 报告结构

`research/git-fit-competitive-review.md` 至少包含：

1. 结论摘要。
2. 来源与证据范围。
3. 产品定位与目标用户对照。
4. 触发机制与技术实现对照。
5. 权限、隐私和安全对照。
6. 安装、分发、活跃度与市场证据。
7. 功能与体验对照表。
8. fitness-buddy 可能差异及其证据强度。
9. 最大未知与风险。
10. 下一项最小验证实验。
11. 建议：继续差异化验证 / 调整定位 / 暂停，并说明推翻该建议需要什么新证据。

## 允许修改

- 新增 `research/git-fit-competitive-review.md`
- 更新 `.personal-os/HANDOFF.md`
- 更新 `.personal-os/STATUS.md`
- 追加 `.personal-os/WORKLOG.md`

不允许修改其他文件。

## 验收标准

- 报告完整回答 7 个必须问题。
- 每项关键事实有一手来源和访问日期。
- 明确区分事实、产品方主张、推断和未知。
- 对 Git-Fit 与 fitness-buddy 都不夸大、不贬低。
- 没有安装、运行或下载竞品二进制。
- 没有修改应用代码或产品验证标准。
- 提供一个无需继续开发即可执行的最小验证实验。
- STATUS 与 WORKLOG 完成回写。
- HANDOFF 完成后变为 DONE；阻塞则变为 BLOCKED 并写明原因。
- 文档任务无需运行 fitness-buddy 应用测试，但必须检查最终 diff、允许文件范围和链接完整性。
- 将文档与 Personal OS 回写提交并 push，最终回复提供 commit SHA、修改文件、验证证据、偏离和仍存在的未知。
