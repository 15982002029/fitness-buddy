// 健身助手 主进程
// 串起：托盘 + 桌宠常驻窗 + 提醒卡片窗 + 活动检测轮询循环。
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');

const store = require('./store');
const detector = require('./activity-detector');
const { ReminderEngine } = require('./reminder-engine');

let tray = null;
let petWin = null;
let reminderWin = null;
let panelWin = null;
let onboardingWin = null;
let engine = null;
let pollTimer = null;
let currentExercise = null; // 当前正在提示的动作
let reminderTimeout = null; // 提醒卡无人理会时的自动收起计时
let petState = 'normal'; // normal | tired | happy
let sittingStartAt = Date.now(); // 本段连坐的开始时间（完成活动或离开电脑后重置）
let pausedUntil = 0; // 暂停提醒到这个时间点（启动时从 store 恢复，「今天不再提醒」重启仍有效）

const POLL_MS = 5000; // 每 5 秒采样一次
const isDev = process.argv.includes('--dev');

// macOS 上不在 Dock 显示，纯托盘 + 桌宠
if (process.platform === 'darwin' && app.dock) app.dock.hide();

function createPetWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const size = store.getSettings().petSize;
  // 灵狐是竖版 3:4，窗口按竖长比例给，另留出上方气泡 + 下方数据条的空间
  const winW = size + 40;
  const winH = Math.round(size * 4 / 3) + 70;
  petWin = new BrowserWindow({
    width: winW,
    height: winH,
    x: width - winW - 40,
    y: 100,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.loadFile(path.join(__dirname, 'windows', 'pet.html'));
  petWin.on('closed', () => { petWin = null; });
}

function createReminderWindow(payload) {
  if (reminderWin) {
    reminderWin.webContents.send('reminder:show', payload);
    reminderWin.showInactive();
    return;
  }
  // 弹在鼠标所在的屏幕（多显示器时别弹去主屏没人看的角落）
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = disp.workArea;
  const w = 380;
  const h = 380;
  reminderWin = new BrowserWindow({
    width: w,
    height: h,
    x: wa.x + wa.width - w - 24,
    y: wa.y + wa.height - h - 24,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  reminderWin.setAlwaysOnTop(true, 'screen-saver');
  reminderWin.loadFile(path.join(__dirname, 'windows', 'reminder.html'));
  reminderWin.webContents.once('did-finish-load', () => {
    reminderWin.webContents.send('reminder:show', payload);
    reminderWin.showInactive(); // 不抢焦点，不打断打字
  });
  reminderWin.on('closed', () => { reminderWin = null; });
}

function closeReminder() {
  if (reminderTimeout) { clearTimeout(reminderTimeout); reminderTimeout = null; }
  if (reminderWin) {
    reminderWin.close();
    reminderWin = null;
  }
}

// 点击灵狐弹出的面板：今日数据 + 设置
let lastPanelCloseAt = 0;
function togglePanel() {
  if (panelWin) { closePanel(); return; }
  // 刚因 blur 关闭又立刻收到点击（点灵狐时会先 blur 面板）→ 视为“关闭”，不重开
  if (Date.now() - lastPanelCloseAt < 350) return;
  const w = 340;
  const h = 680;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  // 尽量贴着桌宠显示
  let x = width - w - 40;
  let y = 100;
  if (petWin) {
    const b = petWin.getBounds();
    x = Math.min(Math.max(b.x + b.width / 2 - w / 2, 8), width - w - 8);
    y = Math.min(b.y + b.height + 6, height - h - 8);
  }
  panelWin = new BrowserWindow({
    width: w, height: h, x: Math.round(x), y: Math.round(y),
    frame: false, transparent: true, resizable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  // 面板里要打字：层级用 floating（够置顶），别用 screen-saver——
  // 那会压在输入法候选词窗上面，用户看不见拼音
  panelWin.setAlwaysOnTop(true, 'floating');
  panelWin.loadFile(path.join(__dirname, 'windows', 'panel.html'));
  panelWin.on('blur', () => closePanel()); // 点别处自动收起
  panelWin.on('closed', () => { panelWin = null; });
}

function closePanel() {
  if (panelWin) { panelWin.close(); panelWin = null; lastPanelCloseAt = Date.now(); }
}

// 主动来一个动作（托盘和面板都用）
function triggerManualExercise() {
  if (reminderWin) return;
  const { chooseBreakContent } = require('./reminder-engine');
  showReminder({ label: '主动休息一下', reason: 'manual', exercise: chooseBreakContent(store.getProfile()) });
}

// 首次运行的问卷引导窗
function createOnboardingWindow() {
  if (onboardingWin) { onboardingWin.focus(); return; }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const w = 440;
  const h = 560;
  onboardingWin = new BrowserWindow({
    width: w, height: h,
    x: Math.round((width - w) / 2), y: Math.round((height - h) / 2),
    frame: false, transparent: true, resizable: false, skipTaskbar: false,
    alwaysOnTop: true, hasShadow: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  onboardingWin.loadFile(path.join(__dirname, 'windows', 'onboarding.html'));
  onboardingWin.on('closed', () => { onboardingWin = null; });
}

// 引导完成后再启动桌宠 + 轮询
function startNormalMode() {
  if (!petWin) createPetWindow();
  startPolling();
  pushStats();
  refreshTray();
}

function setPetState(s) {
  petState = s;
  if (petWin) petWin.webContents.send('pet:state', { state: s });
}

function pushStats() {
  if (petWin) petWin.webContents.send('stats:update', store.getStats());
}

function showReminder(decision) {
  currentExercise = decision.exercise;
  setPetState('tired');
  createReminderWindow({
    label: decision.label,
    reason: decision.reason,
    exercise: decision.exercise
  });
  engine.noteReminderShown();
  armAutoDismiss(decision.exercise);
}

// 没人理的话自己静静收起（不算跳过、不算完成，之后隔最小间隔再试）。
// 时长要比动作倒计时长：完成按钮要倒计时结束才亮，别在那之前把卡收走。
function armAutoDismiss(exercise) {
  if (reminderTimeout) clearTimeout(reminderTimeout);
  const graceMs = Math.max(90000, (exercise?.durationSec || 60) * 1000 + 45000);
  reminderTimeout = setTimeout(() => {
    if (reminderWin) {
      engine.noteAutoDismissed();
      closeReminder();
      setPetState('normal');
    }
  }, graceMs);
}

// 「换一个」：同一次休息内换个内容，不重置任何时钟
function swapExercise() {
  const { chooseBreakContent } = require('./reminder-engine');
  let next = chooseBreakContent(store.getProfile());
  // 尽量别换出同一个（最多重试 4 次）
  for (let i = 0; i < 4 && next && currentExercise && next.id === currentExercise.id; i++) {
    next = chooseBreakContent(store.getProfile());
  }
  // 实在换不出别的（比如只选了一个活动）→ 保持原卡不动，
  // 别重发同一张卡把用户的倒计时和完成按钮重置回起点
  if (!next || (currentExercise && next.id === currentExercise.id)) return;
  currentExercise = next;
  if (reminderWin) {
    reminderWin.webContents.send('reminder:show', { label: '换一个试试', reason: 'swap', exercise: next });
  }
  armAutoDismiss(next);
}

// 把连坐时间、下次提醒预估推给桌宠（灵狐随久坐渐变、hover 显示信息）
function pushVitals() {
  if (!petWin) return;
  const now = Date.now();
  const s = store.getSettings();
  const sittingMin = Math.max(0, Math.round((now - sittingStartAt) / 60000));
  const elapsed = now - engine.lastBreakAt;
  const totalMs = s.breakIntervalMin * 60000;
  const progress = Math.min(1, elapsed / totalMs); // 0=刚休息过 1=到期
  const nextInMin = Math.max(0, Math.ceil((totalMs - elapsed) / 60000));
  petWin.webContents.send('pet:vitals', {
    sittingMin,
    progress,
    nextInMin,
    pausedUntil: pausedUntil > now ? pausedUntil : 0
  });
}

// 暂停提醒（分钟数，或 'today' = 到今晚为止）；落盘，重启仍有效
function pauseReminders(kind) {
  const now = new Date();
  if (kind === 'today') {
    const end = new Date(now); end.setHours(23, 59, 0, 0);
    pausedUntil = end.getTime();
  } else {
    pausedUntil = Date.now() + Number(kind || 60) * 60000;
  }
  store.setPausedUntil(pausedUntil);
  closeReminder();
  setPetState('normal');
  refreshTray();
  pushVitals();
}

function resumeReminders() {
  pausedUntil = 0;
  store.setPausedUntil(0);
  refreshTray();
  pushVitals();
}

// 用户自己喝了水（托盘/面板一键记录），统一入口
function markWaterDrunk() {
  const stats = store.recordWater();
  engine.lastWaterAt = Date.now();
  pushStats();
  refreshTray();
  return stats;
}

// 「我去忙 X」：本地规则分析用户要去干嘛 → 预估时长 / 是否算喝水 / 灵狐回一句。
// 规则覆盖常见场景即可；以后可换成 AI 分析（接口不变）。
const AWAY_RULES = [
  { re: /厕所|洗手间|卫生间|方便|wc/i, min: 5, water: false, reply: '去吧去吧，顺便伸个懒腰 🦊' },
  { re: /咖啡|茶|接[杯点]?水|倒[杯点]?水|喝[杯点]?水|饮/, min: 3, water: true, reply: '补水好习惯！我帮你记上 💧' },
  { re: /吃|[早午晚](饭|餐)|夜宵|lunch|dinner/i, min: 45, water: true, reply: '好好吃饭，慢慢嚼 🍚 我看家' },
  { re: /开会|会议|例会|面试|meeting/i, min: 60, water: false, reply: '开会顺利！结束前我不吵你 🤫' },
  { re: /散步|走走|遛|出去|下楼|快递|外卖/, min: 15, water: false, reply: '走起！晒晒太阳更好 ☀️' },
  { re: /午睡|睡|躺|休息/, min: 30, water: false, reply: '好好休息，我守着 🛏️' },
  { re: /跳绳|运动|健身|锻炼|撸铁|跑步/, min: 20, water: false, reply: '太棒了！这才是真·健身 💪' }
];

function classifyAway(text) {
  const t = String(text || '').trim();
  // 末尾带数字 = 用户自己指定分钟数（如「开会 90」）
  const numMatch = t.match(/(\d{1,3})\s*(分钟|分|min)?\s*$/);
  const userMin = numMatch ? Math.min(240, Math.max(1, Number(numMatch[1]))) : null;
  for (const r of AWAY_RULES) {
    if (r.re.test(t)) return { minutes: userMin || r.min, water: r.water, reply: r.reply };
  }
  return { minutes: userMin || 10, water: false, reply: '去吧，回来我再陪你 🦊' };
}

// 灵狐说一句话（气泡短暂显示）
function petSay(text, ms = 6000) {
  if (petWin) petWin.webContents.send('pet:say', { text, ms });
}

// 应用「我去忙 X」：现在就算一次休息 + 预估时长内免打扰 + 记录
function goAway(text) {
  const plan = classifyAway(text);
  // 起身本身就是这次休息：重置 40 分钟时钟（喝水类顺带重置水钟）
  engine.noteBreakTaken(plan.water ? { category: 'water' } : null);
  if (plan.water) store.recordWater();
  // 主动起身算一次完成；今日活动时长给个适度的记账（封顶 10 分钟，别虚高）
  store.recordComplete({ category: 'custom', durationSec: Math.min(plan.minutes, 10) * 60 });
  // 预估时长内免打扰（复用暂停机制，落盘、到点自动恢复）
  pausedUntil = Date.now() + plan.minutes * 60000;
  store.setPausedUntil(pausedUntil);
  sittingStartAt = Date.now();
  closeReminder();
  setPetState('happy');
  petSay(plan.reply);
  setTimeout(() => setPetState('normal'), 8000);
  pushStats();
  pushVitals();
  refreshTray();
  return plan;
}

// 轮询主循环
async function tick() {
  const settings = store.getSettings();
  engine.updateSettings(settings);

  // 便宜的信号先测：系统空闲时间免费拿（powerMonitor），不用起子进程
  const idleSec = detector.getIdleSeconds();
  if (idleSec < 5) engine.noteUserActive();
  if (idleSec >= 300) {
    // 离开电脑 5 分钟以上 = 一次自然休息：连坐结束，40 分钟时钟也重置
    sittingStartAt = Date.now();
    engine.noteNaturalBreak();
  }
  pushVitals();

  // 暂停中 / 已有提醒卡开着 → 不可能弹卡，别白起 get-windows 子进程
  if (Date.now() < pausedUntil) return;
  if (reminderWin) return;

  const s = await detector.sample(settings.codingApps, settings.excludedApps);
  const decision = engine.decide(s);
  if (decision) showReminder(decision);
}

function buildTrayMenu() {
  const stats = store.getStats();
  const paused = Date.now() < pausedUntil;
  const pausedLabel = paused
    ? `已暂停到 ${new Date(pausedUntil).getHours()}:${String(new Date(pausedUntil).getMinutes()).padStart(2, '0')}`
    : null;
  return Menu.buildFromTemplate([
    { label: `今日完成 ${stats.completedCount} 次 · 连续 ${stats.streak} 天`, enabled: false },
    ...(pausedLabel ? [{ label: `⏸ ${pausedLabel}`, enabled: false }] : []),
    { type: 'separator' },
    { label: '打开面板 / 设置', click: () => { if (!panelWin) togglePanel(); } },
    { label: '立即来个小动作', click: () => triggerManualExercise() },
    { label: '我喝过水了 💧', click: () => markWaterDrunk() },
    { type: 'separator' },
    ...(paused
      ? [{ label: '恢复提醒', click: () => resumeReminders() }]
      : [
          { label: '暂停 1 小时', click: () => pauseReminders(60) },
          { label: '今天不再提醒', click: () => pauseReminders('today') }
        ]),
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  // 用一个简单的圆点图标（base64 透明 PNG 占位），避免缺图标文件
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAi0lEQVR4nO3WMQ6AIAxA0e8d3P9' +
    '+jpODiUNNGAyJ8b8FCAlNW0qABwgwAhswAyuwAAdwAg2QgQ7ogQHIwApMQAvUwAjMwA60QAfMwAEcwArUwAa0wAQcwAW0QAfMwA' +
    '4cwApUwAa0wAQcwAW0QAfMwA4cwApUwAa0wAQcwAW0QAfMwA4cwAr8/QFUjQfBQ2cVnQAAAABJRU5ErkJggg=='
  );
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('健身助手');
  refreshTray();
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => { tick().catch((e) => console.error('tick error', e)); }, POLL_MS);
}

// ---- IPC ----
ipcMain.on('reminder:complete', () => {
  store.recordComplete(currentExercise);
  engine.noteBreakTaken(currentExercise);
  sittingStartAt = Date.now(); // 真的动过了，连坐从头计
  closeReminder();
  setPetState('happy');
  pushStats();
  pushVitals();
  refreshTray();
  setTimeout(() => setPetState('normal'), 8000);
});

// 「换一个」：这个动作不想做，但愿意做别的
ipcMain.on('reminder:another', () => swapExercise());

// 喝水卡上的「刚喝过了」：用户其实已经喝过、只是没告诉灵狐——
// 记水 + 重置水钟，不算跳过也不算这次完成，收起卡片等下个停顿
ipcMain.on('reminder:drank-already', () => {
  markWaterDrunk();
  engine.noteWait();
  closeReminder();
  setPetState('happy');
  petSay('好嘞，记上了 💧 早说嘛~');
  setTimeout(() => setPetState('normal'), 5000);
});

// 「等一下」：不重置 40 分钟到期时钟，只收起卡片；等你下一次停手 30 秒再弹
ipcMain.on('reminder:wait', () => {
  store.recordSnooze();
  engine.noteWait();
  closeReminder();
  setPetState('normal');
});

ipcMain.on('reminder:skip', () => {
  store.recordSkip();
  engine.noteBreakTaken(currentExercise); // 重置久坐计时，但记为跳过
  closeReminder();
  setPetState('normal');
  pushStats();
});

ipcMain.on('stats:request', () => pushStats());

// ---- 桌宠拖拽 / 点击 ----
ipcMain.on('pet:move', (_e, { x, y }) => {
  if (petWin) petWin.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on('pet:toggle-panel', () => togglePanel());

// ---- 面板 ----
ipcMain.handle('panel:get', () => ({
  settings: store.getSettings(),
  stats: store.getStats(),
  week: store.getWeek(),
  profile: store.getProfile(),
  paused: Date.now() < pausedUntil,
  autostart: app.getLoginItemSettings().openAtLogin
}));

// 面板里改「休息时愿意做什么」，即时生效
ipcMain.handle('panel:save-activities', (_e, activities) => {
  const clean = Array.isArray(activities)
    ? activities
        .filter((a) => a && typeof a.label === 'string' && a.label.trim())
        .map((a) => ({ label: a.label.trim().slice(0, 16), cat: a.cat || undefined, group: a.group || 'general' }))
    : [];
  const profile = store.updateProfile({ activities: clean });
  engine.setProfile(profile);
  return profile;
});

ipcMain.handle('panel:drank', () => markWaterDrunk());

ipcMain.on('panel:pause', (_e, kind) => pauseReminders(kind));
ipcMain.on('panel:resume', () => resumeReminders());

// 「我去忙 X」：主动告诉灵狐要离开去干嘛，返回分析结果给面板展示
ipcMain.handle('panel:away', (_e, text) => goAway(text));

ipcMain.handle('panel:save', (_e, patch) => {
  // 清洗 + 钳制数值。0/负数会让引擎失控（pauseSec=0 → 打字时也弹；间隔 0 → 无限弹卡），
  // HTML 的 min 属性不约束手输值，必须在这里兜底。
  const LIMITS = { breakIntervalMin: [5, 240], pauseSec: [5, 300], waterIntervalMin: [10, 360] };
  const clean = {};
  for (const k of Object.keys(LIMITS)) {
    const n = Number(patch[k]);
    if (patch[k] != null && Number.isFinite(n)) {
      clean[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], Math.round(n)));
    }
  }
  if (typeof patch.dndStart === 'string') clean.dndStart = patch.dndStart;
  if (typeof patch.dndEnd === 'string') clean.dndEnd = patch.dndEnd;
  const settings = store.updateSettings(clean);
  engine.updateSettings(settings);
  return settings;
});

ipcMain.handle('panel:set-autostart', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  refreshTray();
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('panel:do-exercise', () => { closePanel(); triggerManualExercise(); });
ipcMain.on('panel:close', () => closePanel());

// ---- 首次问卷引导 ----
function finishOnboarding() {
  engine.updateSettings(store.getSettings());
  engine.setProfile(store.getProfile());
  if (onboardingWin) { onboardingWin.close(); onboardingWin = null; }
  startNormalMode();
}
ipcMain.on('onboarding:submit', (_e, answers) => {
  store.completeOnboarding(answers || {});
  finishOnboarding();
});
ipcMain.on('onboarding:skip', () => {
  store.skipOnboarding();
  finishOnboarding();
});

// ---- 生命周期 ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    engine = new ReminderEngine(store.getSettings(), store.getProfile());
    pausedUntil = store.getPausedUntil(); // 「今天不再提醒」重启后仍然生效
    createTray();
    if (store.isOnboarded()) {
      startNormalMode();
    } else {
      createOnboardingWindow(); // 首次运行先做问卷
    }
    if (isDev) console.log('[健身助手] 已启动（dev）。onboarded:', store.isOnboarded(), 'userData:', app.getPath('userData'));
  });

  app.on('window-all-closed', (e) => {
    // 关掉窗口不退出，留在托盘
    if (!app.isQuitting) e.preventDefault?.();
  });

  app.on('before-quit', () => { app.isQuitting = true; });
}
