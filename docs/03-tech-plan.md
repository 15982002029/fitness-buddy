# 技术路线

## 推荐技术栈

第一版推荐：

- 桌面框架：Tauri
- UI：TypeScript + React
- 本地存储：SQLite 或简单 JSON
- 动画：CSS animation / Lottie / sprite sheet
- 通知：系统通知 + 桌宠气泡

## 为什么不是先做 Web

这个项目的核心场景是桌面常驻和后台提醒。Web 页面很难自然地做到常驻置顶、托盘、系统通知、开机自启和透明小窗，所以第一版直接做桌面端更贴合产品。

## 为什么不是先做移动端

目标用户的痛点发生在电脑前。移动端可以后续作为统计和设置入口，但不应该成为第一版主战场。

## 模块设计

### pet-window

负责桌宠显示、拖动、状态动画、提醒气泡。

### reminder-engine

负责计时、勿扰、稍后提醒、提醒优先级。

### movement-library

负责动作数据读取、筛选、推荐。

### activity-log

负责记录完成、跳过、喝水、连续使用天数。

### settings

负责提醒间隔、开机自启、宠物外观、勿扰时间段。

## 数据模型草案

### Exercise

- `id`
- `name`
- `category`
- `durationSec`
- `bodyArea`
- `equipment`
- `steps`
- `caution`
- `intensity`

### Reminder

- `id`
- `type`
- `scheduledAt`
- `status`
- `exerciseId`
- `snoozeUntil`

### DailyStats

- `date`
- `completedCount`
- `skippedCount`
- `waterCount`
- `activeBreakSeconds`

## 开源项目使用边界

可以优先复用：

- MIT / BSD 项目的架构思路或可兼容代码。
- 自己原创的办公室动作数据。
- 外部 API 的公开接口，但要确认服务条款。

需要谨慎：

- GPL / AGPL 项目代码。
- 未明确许可证的数据集。
- 直接抓取带版权图片、GIF、视频的动作素材。

## 第一版技术任务

1. 初始化 Tauri 项目。
2. 做透明常驻窗口。
3. 做一个可拖动的宠物组件。
4. 写提醒引擎。
5. 读取 `data/office-micro-exercises.seed.json`。
6. 做本地统计。
7. 打包 macOS 测试版本。

