# 健身助手 · 灵狐桌宠

> 一个会在你**等 AI 回复的间隙**提醒你活动身体的桌面健身宠物。面向 vibe coding / 长时间电脑工作者。

它不是传统健身 App，而是一只常驻桌面的灵狐小宠物：在你写代码久了、或停手等 AI 跑的时候，轻轻弹出一个 30 秒小动作提醒你站起来、活动肩颈手腕、喝水、休息眼睛——你一敲键盘它就自动收起，绝不打断心流。

## 下载与安装（macOS · Apple Silicon）

**方式一：下载 App（推荐给非开发者）**

1. 到 [Releases](../../releases) 下载最新的 `健身助手-x.y.z-arm64.dmg`。
2. 双击打开，把「健身助手」拖进「应用程序」。
3. **首次打开**：因为 App 未做苹果签名，macOS 会提示"无法验证开发者"。
   右键点图标 → 打开 → 再点"打开"即可；或在终端运行一次：
   ```bash
   xattr -dr com.apple.quarantine "/Applications/健身助手.app"
   ```
   （这是所有未签名开源桌面 App 的通用现象，不是病毒提示。）

**方式二：终端一键运行（推荐给开发者）**

```bash
git clone https://github.com/15982002029/fitness-buddy.git
cd fitness-buddy
npm install
npm start
```

启动后屏幕右上角会出现灵狐，菜单栏也会有它的图标。首次运行会有一个 20 秒的小问卷，帮它更懂你。

> 目前只打包了 Apple Silicon（arm64）版本。Intel Mac / Windows / Linux 可用「方式二」自行运行（Electron 跨平台），或提 issue。

## 当前状态

版本 v0.1.2（main 分支另含少量发版后的体验改进）。可运行的 Electron 桌面应用，处于**开发者本人自用验证阶段**；外部用户验证尚未开始。

**已实现**（有提交记录为证）：

- 灵狐桌宠常驻：可拖动、贴边收纳成小图标、位置记忆、托盘隐藏/显示。
- 触发模型：每 N 分钟休息「到期」→ 等「停手 ≥30 秒」的自然停顿才弹，打字时绝不弹；全屏（编码工具除外）或会议软件前台时不弹；离开电脑 ≥5 分钟算自然休息。
- 提醒卡：完成（倒计时走完才可点）/ 换一个 / 等一下 / 跳过；喝水卡有「刚喝过了」。
- 「我去忙别的」：主动告诉灵狐去干嘛（上厕所/吃饭/接水…），按预估时长免打扰并计一次起身。
- 23 个办公室微运动（步骤 + 注意事项 + 为什么有用）。
- 首次问卷（活动偏好可自选可自定义）、设置面板、今日数据与最近 7 天统计。
- 零系统权限；DMG / zip 打包（Apple Silicon）。

**验证进度**（诚实区分）：

- ✅ 已实现：上述功能。
- 🔄 本人自用中：开发者本人日常使用，多轮真实反馈已驱动触发模型重做与体验修复；尚无连续多天的量化数据。
- ⏳ 待外部验证：按 [验证计划](./docs/04-validation-plan.md)，3–5 名长时间电脑工作者连续使用 3 天的验证**尚未开始**；完成率、跳过率、打扰感等数据尚未收集。是否值得继续投入、传播或商业化，以该验证结果为准。

## 目标用户

- 每天长时间坐在电脑前的人。
- 使用 Cursor、Codex、Claude Code、ChatGPT 等工具进行长时间 vibe coding 的开发者。
- 容易连续工作 2-4 小时忘记喝水、站起来、活动肩颈和手腕的人。
- 不想打开复杂健身 App，但愿意接受一个轻量、温和、可爱的桌面提醒的人。

## 一句话版本

一个会陪你写代码的桌面健身宠物：它不逼你健身，只在你久坐太久时，用 30 秒到 3 分钟的小动作把你从屏幕前拉回来。

## 核心体验

1. 桌面上常驻一个小宠物或小角色。
2. 它根据工作时长、空闲状态、喝水记录、上次活动时间改变状态。
3. 到时间后，它弹出一个非常短的建议：站起来 60 秒、做手腕伸展、肩颈活动、远眺、喝水。
4. 用户可以一键完成、稍后提醒、跳过。
5. 完成后宠物状态变好，用户得到轻反馈和连续记录。

## 本地运行

第一版原型已用 **Electron** 实现（不是 Tauri，原因见 DECISIONS）。

```bash
npm install
npm start      # 或 npm run dev 看启动日志
```

打包成独立 App（自用 / 分发测试）：

```bash
npm run pack   # 输出 release/mac-arm64/健身助手.app（未签名，自用足够）
```

打包用 electron-builder，配置在 package.json 的 `build` 字段。图标 `assets/icon.icns` 由灵狐图生成。
`npmRebuild: false` 是必须的：get-windows 自带预编译二进制，不能让 node-gyp 重编（Python 3.12 已移除 distutils 会失败）。
自用建议把 `健身助手.app` 放到 `/Applications`。

启动后：

- 屏幕右上角出现一个常驻置顶的灵狐小宠物。**拖动**可移动位置，**单击**弹出面板（今日数据 + 设置）。
- 面板里可调：等 AI 判定秒数、提醒冷却、久坐兜底、喝水间隔、勿扰时段、开机自启，以及「来个小动作」。
- 托盘里也有菜单：打开面板 / 立即来个小动作 / 暂停 1 小时 / 开机自启 / 退出。
- 当你在编码工具里停手（大概率在等 AI 回复）时，右下角弹出一张 30 秒小动作卡片；你一敲键盘它自动收起。

> **权限说明**：本应用**不需要任何系统权限**即可工作。
> 检测「当前前台是不是编码工具」只用到前台 App 名称（走 NSWorkspace，无需授权），不读窗口标题、不录屏。
> 实现上给 get-windows 传了 `{ accessibilityPermission: false, screenRecordingPermission: false }`——
> 否则它的辅助程序会每次调用都弹一次辅助功能授权框（那个辅助程序是独立可执行文件，和 App 的授权不共享）。

## 目录结构

```text
app/
  main.js               主进程：托盘 + 桌宠窗 + 提醒窗 + 轮询循环
  activity-detector.js  系统空闲时间 + 前台 App 检测（判断是否在等 AI）
  reminder-engine.js    决定何时提醒、提醒哪个动作
  store.js              本地 JSON 存储：今日统计 + 设置 + 连续天数
  preload.js            渲染/主进程 IPC 桥
  windows/
    onboarding.html     首次运行的问卷引导（5 题 → 生成用户画像 + 设置）
    pet.html            桌宠（透明常驻、手动拖拽 + 单击开面板、状态随久坐/完成变化）
    reminder.html       提醒卡片（动作步骤 + 倒计时 + 完成/稍后/跳过）
    panel.html          点击桌宠弹出的面板（今日数据 + 设置）
data/
  office-micro-exercises.seed.json  办公室微运动动作库（23 个）
```

## 相关文档

- [当前任务](./NOW.md)
- [想法和笔记](./ideas.md)
- [产品简报](./docs/01-product-brief.md)
- [MVP 需求](./docs/02-mvp-spec.md)
- [技术路线](./docs/03-tech-plan.md)
- [验证计划](./docs/04-validation-plan.md)
- [GitHub 开源参考](./research/github-open-source-reference.md)
- [微运动 seed 数据](./data/office-micro-exercises.seed.json)

