// 本地数据存储：今日统计 + 设置 + 连续天数。纯 JSON，离线，不上传。
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_FILE = path.join(app.getPath('userData'), 'fitness-buddy.json');

const DEFAULT_SETTINGS = {
  // 等 AI 回复检测：前台是编码工具 + 停手超过这么多秒，就认为你在等 AI，可以提醒
  aiWaitIdleSec: 25,
  // 两次提醒最小间隔（分钟），避免太频繁
  reminderCooldownMin: 20,
  // 兜底：就算不在编码工具里，久坐这么多分钟也提醒一次
  maxSittingMin: 50,
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
  petSize: 110,
  autoDismissOnReturn: true
};

// 用户画像（由首次 onboarding 问卷生成，影响动作推荐与触发策略）
const DEFAULT_PROFILE = {
  painAreas: [],                 // ['eyes','neck_shoulder','wrist','back','legs','mental']
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

let state = load();

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      profile: { ...DEFAULT_PROFILE, ...(raw.profile || {}) },
      onboarded: !!raw.onboarded,
      daily: raw.daily || emptyDaily(todayStr()),
      streak: raw.streak || 0,
      lastActiveDate: raw.lastActiveDate || null
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, profile: { ...DEFAULT_PROFILE }, onboarded: false, daily: emptyDaily(todayStr()), streak: 0, lastActiveDate: null };
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
  state.daily = emptyDaily(t);
  persist();
}

// 把问卷答案翻译成设置补丁 + 画像。集中放这里，方便调。
function onboardingToConfig(answers) {
  const settingsPatch = {};

  // 提醒频率 → 冷却 + 久坐兜底
  const freq = { dense: [15, 35], medium: [25, 50], sparse: [40, 75] }[answers.frequency] || [25, 50];
  settingsPatch.reminderCooldownMin = freq[0];
  settingsPatch.maxSittingMin = freq[1];

  // 打扰强度 → 停手判定秒数（坚定=更早抓到你）
  settingsPatch.aiWaitIdleSec = answers.intensity === 'firm' ? 18 : 30;

  // 勿扰时段（可选）
  if (answers.dndStart) settingsPatch.dndStart = answers.dndStart;
  if (answers.dndEnd) settingsPatch.dndEnd = answers.dndEnd;

  // 每次时长 → 动作时长上限
  const dur = { short: 35, medium: 120, any: 999 }[answers.duration] || 999;

  const profile = {
    painAreas: Array.isArray(answers.painAreas) ? answers.painAreas : [],
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
  getStats() {
    rolloverIfNeeded();
    return { ...state.daily, streak: state.streak };
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
