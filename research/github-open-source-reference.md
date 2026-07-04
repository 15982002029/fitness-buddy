# GitHub 开源参考

调研时间：2026-06-30

调研方式：使用 agent-reach 的 GitHub 后端，也就是 GitHub CLI `gh`，检索健身动作库、开源健身 App、久坐提醒、桌面宠物相关仓库。

## 结论

这个项目不应该简单复制某个开源健身 App。更合理的整合方式是：

- 健身项目提供动作库、训练计划、动作分类的参考。
- 久坐提醒项目提供提醒节奏、勿扰、跳过/稍后、系统通知的参考。
- 桌面宠物项目提供透明窗口、拖动、常驻置顶、状态动画的参考。
- MVP 数据先自建，避免动作图片、GIF、视频和 GPL/AGPL 数据的许可问题。

## 健身 / 动作库方向

| 项目 | Stars | 许可证 | 语言 | 参考价值 |
| --- | ---: | --- | --- | --- |
| [Snouzy/workout-cool](https://github.com/Snouzy/workout-cool) | 7967 | MIT | TypeScript | 现代健身训练平台，适合参考训练计划、动作库、进度记录的信息架构。 |
| [wger-project/wger](https://github.com/wger-project/wger) | 6314 | AGPL-3.0 | Python | 成熟的自托管健身、营养、体重追踪系统，适合研究领域模型，但闭源商业产品不能直接复制代码。 |
| [ExerciseDB/exercisedb-api](https://github.com/ExerciseDB/exercisedb-api) | 371 | AGPL-3.0 | 未标明 | 动作数据库 API，动作数量多，适合研究动作字段设计；直接使用要确认 AGPL 和服务条款。 |
| [davejt/exercise](https://github.com/davejt/exercise) | 161 | 未标明 | 未标明 | 开放动作 API，许可证不清晰，先只作为字段参考。 |

## 久坐 / 休息提醒方向

| 项目 | Stars | 许可证 | 语言 | 参考价值 |
| --- | ---: | --- | --- | --- |
| [hovancik/stretchly](https://github.com/hovancik/stretchly) | 6336 | BSD-2-Clause | JavaScript | 老牌休息提醒工具，适合参考跨平台提醒、长短休息、通知和设置体验。 |
| [rcaelers/workrave](https://github.com/rcaelers/workrave) | 1773 | GPL-3.0 | C++ | 关注 RSI 预防，有微休息、休息和每日限制，适合研究提醒层级。 |
| [slgobinath/safeeyes](https://github.com/slgobinath/safeeyes) | 1730 | GPL-3.0 | Python | 护眼休息提醒，适合参考插件化和眼睛休息场景。 |
| [nomandhoni-cs/blink-eye](https://github.com/nomandhoni-cs/blink-eye) | 254 | Other | TypeScript | 较新的跨平台护眼和休息提醒工具，适合看现代 UI 和统计。 |
| [AllanChain/sane-break](https://github.com/AllanChain/sane-break) | 88 | GPL-3.0 | C++ | 关注避免用户无意识跳过休息，适合参考反跳过策略。 |
| [pilgrimlyieu/Focust](https://github.com/pilgrimlyieu/Focust) | 45 | GPL-3.0 | Rust | 跨平台休息提醒，Rust 技术栈可作为 Tauri/Rust 方向参考。 |

## 桌面宠物方向

| 项目 | Stars | 许可证 | 语言 | 参考价值 |
| --- | ---: | --- | --- | --- |
| [lsllsl123/desktop-pet-electron](https://github.com/lsllsl123/desktop-pet-electron) | 1 | 未标明 | TypeScript | 像素风 Electron 桌面宠物，适合看透明窗口和桌面角色思路。 |
| [Y1fe1-Yang/desktop-pet-electron](https://github.com/Y1fe1-Yang/desktop-pet-electron) | 0 | 未标明 | JavaScript | 桌面浮动宠物 Demo，只做技术交互参考。 |
| [KoujiMinamoto/aibotpet](https://github.com/KoujiMinamoto/aibotpet) | 0 | 未标明 | JavaScript | AI 聊天桌宠概念，适合参考宠物与对话结合，但不作为第一版重点。 |

桌宠方向的 GitHub 项目整体成熟度不如健身和提醒类项目。第一版最好自己做一个轻量角色，而不是依赖这些小项目。

## 可借鉴的产品结构

### 从 workout-cool / wger 借鉴

- 动作库字段：部位、器械、难度、步骤、注意事项。
- 训练记录：完成次数、历史趋势、身体部位覆盖。
- 计划生成：按目标组合动作。

### 从 Stretchly / Workrave / Safe Eyes 借鉴

- 微休息与长休息分层。
- 稍后提醒、跳过、勿扰。
- 系统托盘和后台运行。
- 眼睛休息、手腕休息、站立活动的不同提醒。

### 从桌宠项目借鉴

- 透明窗口。
- 常驻置顶。
- 拖动和吸附屏幕边缘。
- 状态动画。
- 用角色状态表达用户行为。

## 许可证提醒

MIT / BSD 项目更适合直接复用代码或实现思路。

GPL / AGPL 项目可以研究设计，但如果直接复制代码或深度整合，可能要求衍生作品以兼容许可证开源。商业闭源版本要尤其谨慎。

未标明许可证的仓库默认不能自由复制代码和素材。

## 下一次调研可以补充

- App Store / Setapp 上的付费休息提醒工具。
- 小红书/Reddit 上开发者对久坐提醒、桌面宠物的真实吐槽。
- Tauri 透明窗口、托盘、开机自启的最佳实践。

