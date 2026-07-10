// 本地数据存储：今日统计 + 设置 + 连续天数。纯 JSON，离线，不上传。
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_FILE = path.join(app.getPath('userData'), 'fitness-buddy.json');

const DEFAULT_SETTINGS = {
  // 休息到期间隔（分钟）：每隔这么久，休息才“到期”一次
  breakIntervalMin: 40,
  // 停顿判定（秒）：到期后要停手这么久才弹（敲键盘时绝不弹）
  pauseSec: 30,
  // 喝水提醒间隔（分钟）
  waterIntervalMin: 90,
  // 勿扰时间段，格式 "HH:MM"，留空表示不启用
  dndStart: '',
  dndEnd: '',
  // 被认定为“编码 / 等 AI”场景的前台 App 关键词（小写匹配）
  codingApps: [
    'code', 'cursor', 'windsurf', 'webstorm', 'pycharm', 'intellij',
    'terminal', 'iterm', 'warp', 'ghostty', 'kitty', 'alacritty',
    'claude', 'chatgpt', 'xcode', 'zed', 'sublime'
  ],
  // 这些 App 在前台时不弹提醒（开会场景）；全屏时也一律不弹
  excludedApps: ['zoom', 'tencentmeeting', '腾讯会议', 'webex', '会议'],
  petSize: 110
};

// 用户画像（由首次 onboarding 问卷生成，影响动作推荐与触发策略）
const DEFAULT_PROFILE = {
  // 用户愿意在休息时做的活动类别（对应动作库 category）；空 = 全部允许
  // 类别：water/eyes/breathing/shoulder_neck（养身） stand/legs/wrist/back（健身）
  activities: [],
  preferredMaxDurationSec: 999,  // 每次想活动多久
  workStyle: '',                 // 'wait_ai' | 'deep_focus' | 'meetings'
  intensity: 'gentle'            // 'gentle' | 'firm'
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDaily(date) {
  return { date, completedCount: 0, skippedCount: 0, snoozeCount: 0, waterCount: 0, activeBreakSeconds: 0 };
}

// 旧格式活动偏好（纯 cat 字符串数组，如 ['water','eyes']）→ 新格式 {label, cat, group}。
// 不迁移的话它们在面板里不渲染任何 chip，变成看不见、删不掉的“幽灵限制”。
const LEGACY_CAT_MAP = {
  water: { label: '喝水', cat: 'water', group: 'energy' },
  eyes: { label: '远眺护眼', cat: 'eyes', group: 'eyecare' },
  breathing: { label: '深呼吸', cat: 'breathing', group: 'eyecare' },
  shoulder_neck: { label: '肩颈舒缓', cat: 'shoulder_neck', group: 'stretch' },
  back: { label: '腰背舒展', cat: 'back', group: 'stretch' },
  wrist: { label: '手腕活动', cat: 'wrist', group: 'stretch' },
  stand: { label: '起身走动', cat: 'stand', group: 'move' },
  legs: { label: '原地踏步', cat: 'legs', group: 'move' }
};

function migrateActivities(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => {
      if (typeof a === 'string') return LEGACY_CAT_MAP[a] ? { ...LEGACY_CAT_MAP[a] } : { label: a, group: 'general' };
      return a;
    })
    .filter((a) => a && a.label);
}

let state = load();

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const profile = { ...DEFAULT_PROFILE, ...(raw.profile || {}) };
    profile.activities = migrateActivities(profile.activities);
    return {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      profile,
      onboarded: !!raw.onboarded,
      daily: raw.daily || emptyDaily(todayStr()),
      history: Array.isArray(raw.history) ? raw.history : [],
      streak: raw.streak || 0,
      pausedUntil: raw.pausedUntil || 0,
      lastActiveDate: raw.lastActiveDate || null
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, profile: { ...DEFAULT_PROFILE }, onboarded: false, daily: emptyDaily(todayStr()), history: [], streak: 0, pausedUntil: 0, lastActiveDate: null };
  }
}

function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('保存失败', e);
  }
}

// 跨天处理：如果当前记录不是今天，归档并重置；顺便维护连续天数。
function rolloverIfNeeded() {
  const t = todayStr();
  if (state.daily.date === t) return;

  // 判断连续天数：今天与上次有活动的日期相差 1 天则 +1，否则重置
  const wasActive = state.daily.completedCount > 0 || state.daily.waterCount > 0;
  if (wasActive) {
    const prev = new Date(state.daily.date);
    const now = new Date(t);
    const diffDays = Math.round((now - prev) / 86400000);
    state.streak = diffDays === 1 ? state.streak + 1 : 1;
    state.lastActiveDate = state.daily.date;
  }
  // 归档到历史（保留最近 14 天）
  state.history.push({ ...state.daily });
  if (state.history.length > 14) state.history = state.history.slice(-14);
  state.daily = emptyDaily(t);
  persist();
}

// 把问卷答案翻译成设置补丁 + 画像。集中放这里，方便调。
function onboardingToConfig(answers) {
  const settingsPatch = {};

  // 提醒频率 → 休息到期间隔（分钟）
  settingsPatch.breakIntervalMin = { dense: 25, medium: 40, sparse: 60 }[answers.frequency] || 40;

  // 打扰强度 → 停顿判定（坚定=你刚停手就弹；温柔=多等一会儿再弹）
  settingsPatch.pauseSec = answers.intensity === 'firm' ? 20 : 40;

  // 勿扰时段（可选）
  if (answers.dndStart) settingsPatch.dndStart = answers.dndStart;
  if (answers.dndEnd) settingsPatch.dndEnd = answers.dndEnd;

  // 每次时长 → 动作时长上限
  const dur = { short: 35, medium: 120, any: 999 }[answers.duration] || 999;

  const profile = {
    activities: Array.isArray(answers.activities) ? answers.activities : [],
    preferredMaxDurationSec: dur,
    workStyle: answers.workStyle || '',
    intensity: answers.intensity || 'gentle'
  };

  return { settingsPatch, profile };
}

module.exports = {
  getSettings() {
    return state.settings;
  },
  getProfile() {
    return state.profile;
  },
  isOnboarded() {
    return state.onboarded;
  },
  // 完成问卷：写入画像 + 设置，标记已引导
  completeOnboarding(answers) {
    const { settingsPatch, profile } = onboardingToConfig(answers || {});
    state.settings = { ...state.settings, ...settingsPatch };
    state.profile = { ...DEFAULT_PROFILE, ...profile };
    state.onboarded = true;
    persist();
    return { settings: state.settings, profile: state.profile };
  },
  // 用默认值跳过问卷
  skipOnboarding() {
    state.onboarded = true;
    persist();
    return { settings: state.settings, profile: state.profile };
  },
  updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    persist();
    return state.settings;
  },
  updateProfile(patch) {
    state.profile = { ...state.profile, ...patch };
    persist();
    return state.profile;
  },
  // 暂停状态落盘：「今天不再提醒」重启后仍然有效
  getPausedUntil() {
    return state.pausedUntil || 0;
  },
  setPausedUntil(ts) {
    state.pausedUntil = ts || 0;
    persist();
    return state.pausedUntil;
  },
  getStats() {
    rolloverIfNeeded();
    return { ...state.daily, streak: state.streak };
  },
  // 最近 7 天（含今天），缺的日期补零，给面板画小柱状图
  getWeek() {
    rolloverIfNeeded();
    const byDate = {};
    state.history.forEach((d) => { byDate[d.date] = d; });
    byDate[state.daily.date] = state.daily;
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const d = byDate[key] || emptyDaily(key);
      out.push({ date: key, day: '日一二三四五六'[dt.getDay()], completedCount: d.completedCount, waterCount: d.waterCount, activeBreakSeconds: d.activeBreakSeconds || 0 });
    }
    return out;
  },
  // 只记一杯水（用户自己喝了，主动点一下），不算“完成一次休息”
  recordWater() {
    rolloverIfNeeded();
    state.daily.waterCount += 1;
    if (state.streak === 0) state.streak = 1;
    persist();
    return this.getStats();
  },
  recordComplete(exercise) {
    rolloverIfNeeded();
    state.daily.completedCount += 1;
    state.daily.activeBreakSeconds += exercise?.durationSec || 0;
    if (exercise?.category === 'water') state.daily.waterCount += 1;
    if (state.streak === 0) state.streak = 1; // 今天第一次活动，连续天数起步
    persist();
    return this.getStats();
  },
  recordSkip() {
    rolloverIfNeeded();
    state.daily.skippedCount += 1;
    persist();
    return this.getStats();
  },
  recordSnooze() {
    rolloverIfNeeded();
    state.daily.snoozeCount += 1;
    persist();
    return this.getStats();
  }
};
