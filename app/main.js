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
let pausedUntil = 0; // 暂停提醒到这个时间点

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
  const h = 620;
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
  panelWin.setAlwaysOnTop(true, 'screen-saver');
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
  // 没人理的话，自己静静收起（不算跳过、不算完成）。
  // 时长要比动作倒计时长：完成按钮要倒计时结束才亮，别在那之前把卡收走。
  if (reminderTimeout) clearTimeout(reminderTimeout);
  const graceMs = Math.max(90000, (decision.exercise?.durationSec || 60) * 1000 + 45000);
  reminderTimeout = setTimeout(() => {
    if (reminderWin) { closeReminder(); setPetState('normal'); }
  }, graceMs);
}

// 「换一个」：同一次休息内换个内容，不重置任何时钟
function swapExercise() {
  const { chooseBreakContent } = require('./reminder-engine');
  let next = chooseBreakContent(store.getProfile());
  // 尽量别换出同一个（最多重试 4 次，选项太少时就认了）
  for (let i = 0; i < 4 && next && currentExercise && next.id === currentExercise.id; i++) {
    next = chooseBreakContent(store.getProfile());
  }
  if (!next) return;
  currentExercise = next;
  if (reminderWin) {
    reminderWin.webContents.send('reminder:show', { label: '换一个试试', reason: 'swap', exercise: next });
  }
  // 重新给足自动收起时间
  if (reminderTimeout) clearTimeout(reminderTimeout);
  const graceMs = Math.max(90000, (next.durationSec || 60) * 1000 + 45000);
  reminderTimeout = setTimeout(() => {
    if (reminderWin) { closeReminder(); setPetState('normal'); }
  }, graceMs);
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

// 暂停提醒（分钟数，或 'today' = 到今晚为止）
function pauseReminders(kind) {
  const now = new Date();
  if (kind === 'today') {
    const end = new Date(now); end.setHours(23, 59, 0, 0);
    pausedUntil = end.getTime();
  } else {
    pausedUntil = Date.now() + Number(kind || 60) * 60000;
  }
  closeReminder();
  setPetState('normal');
  refreshTray();
  pushVitals();
}

// 轮询主循环
async function tick() {
  const settings = store.getSettings();
  engine.updateSettings(settings);
  const s = await detector.sample(settings.codingApps, settings.excludedApps);

  // 用户在动 → 重新武装（弹过的提醒等下一次停顿）。
  // 注意：不因为“你动了鼠标”就关掉提醒卡——否则你伸手去点它的瞬间它就没了。
  if (s.idleSec < 5) {
    engine.noteUserActive();
  }
  // 离开电脑 5 分钟以上 → 这段连坐算结束了
  if (s.idleSec >= 300) {
    sittingStartAt = Date.now();
  }

  pushVitals();

  // 暂停中 / 已有提醒卡开着 → 不弹新的
  if (Date.now() < pausedUntil) return;
  if (reminderWin) return;

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
    { label: '我喝过水了 💧', click: () => { store.recordWater(); engine.lastWaterAt = Date.now(); pushStats(); refreshTray(); } },
    { type: 'separator' },
    ...(paused
      ? [{ label: '恢复提醒', click: () => { pausedUntil = 0; refreshTray(); pushVitals(); } }]
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

ipcMain.on('panel:drank', () => {
  store.recordWater();
  engine.lastWaterAt = Date.now();
  pushStats();
  refreshTray();
});

ipcMain.on('panel:pause', (_e, kind) => pauseReminders(kind));
ipcMain.on('panel:resume', () => { pausedUntil = 0; refreshTray(); pushVitals(); });

ipcMain.handle('panel:save', (_e, patch) => {
  // 清洗一下数值，避免非法输入
  const clean = {};
  for (const k of ['breakIntervalMin', 'pauseSec', 'waterIntervalMin']) {
    if (patch[k] != null && !Number.isNaN(Number(patch[k]))) clean[k] = Number(patch[k]);
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
