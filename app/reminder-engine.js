// 提醒引擎：决定「现在该不该弹提醒」，以及弹什么动作。
// 设计原则（参考 stretchly 的节奏，但触发逻辑是本项目独有的「等 AI 间隙」）：
//   1. 你正盯着编码工具、刚停手 → 大概率在等 AI 回复 → 这是最好的打断点。
//   2. 你一动键鼠（idle 归零）→ 立刻收起提醒，绝不打断打字。
//   3. 兜底：久坐太久 / 太久没喝水，也会提醒。
//   4. 冷却时间避免太频繁。

const fs = require('fs');
const path = require('path');

let exercises = [];
try {
  const seed = path.join(__dirname, '..', 'data', 'office-micro-exercises.seed.json');
  exercises = JSON.parse(fs.readFileSync(seed, 'utf-8'));
} catch (e) {
  console.error('动作库读取失败', e);
}

// 问卷里的“最累部位” → 动作库里的 bodyArea 值
const PAIN_AREA_MAP = {
  eyes: ['eyes'],
  neck_shoulder: ['neck', 'shoulder', 'upper_back', 'chest'],
  wrist: ['wrist', 'forearm', 'fingers'],
  back: ['lower_back', 'spine', 'upper_back', 'core'],
  legs: ['legs', 'calf', 'hip', 'ankle'],
  mental: ['whole_body']
};

function areasFor(painAreas) {
  const set = new Set();
  (painAreas || []).forEach((p) => (PAIN_AREA_MAP[p] || []).forEach((a) => set.add(a)));
  return set;
}

// 带用户画像的加权随机：
//   - 命中“最累部位”的动作权重更高（软偏好，不是硬筛，保留多样性）
//   - 超过“每次想活动的时长上限”的动作降权
//   opts: { preferCategory, profile }
function pickExercise(preferCategory, profile) {
  let pool = exercises;
  if (preferCategory) {
    const filtered = exercises.filter((e) => e.category === preferCategory);
    if (filtered.length) pool = filtered;
  }
  if (!pool.length) return undefined;

  const wantAreas = areasFor(profile?.painAreas);
  const maxDur = profile?.preferredMaxDurationSec || 999;

  const weighted = pool.map((e) => {
    let w = 1;
    if (wantAreas.size && (e.bodyArea || []).some((a) => wantAreas.has(a))) w += 2.5; // 命中痛点
    if (e.durationSec > maxDur) w *= 0.35; // 超时降权
    return { e, w };
  });

  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) return x.e;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function inDnd(settings, now = new Date()) {
  const { dndStart, dndEnd } = settings;
  if (!dndStart || !dndEnd) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = dndStart.split(':').map(Number);
  const [eh, em] = dndEnd.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return cur >= start && cur < end;
  return cur >= start || cur < end; // 跨夜
}

class ReminderEngine {
  constructor(settings, profile) {
    this.settings = settings;
    this.profile = profile || null;
    this.lastReminderAt = 0;
    this.lastWaterAt = Date.now();
    this.sittingStartAt = Date.now(); // 本段久坐开始时间
  }

  updateSettings(settings) {
    this.settings = settings;
  }

  setProfile(profile) {
    this.profile = profile;
  }

  // 用户刚活动过（idle 很低），重置久坐计时
  noteUserActive() {
    this.sittingStartAt = Date.now();
  }

  // 用户完成了一次活动，重置计时和冷却
  noteBreakTaken(exercise) {
    const now = Date.now();
    this.lastReminderAt = now;
    this.sittingStartAt = now;
    if (exercise?.category === 'water') this.lastWaterAt = now;
  }

  noteReminderShown() {
    this.lastReminderAt = Date.now();
  }

  // 核心决策。传入一次采样，返回 null（不提醒）或 { reason, exercise }
  decide(sample) {
    const s = this.settings;
    const now = Date.now();

    if (inDnd(s)) return null;

    const cooldownMs = s.reminderCooldownMin * 60 * 1000;
    const sinceLast = now - this.lastReminderAt;
    if (sinceLast < cooldownMs) return null;

    // 喝水兜底：太久没喝水，优先级最高
    if (now - this.lastWaterAt > s.waterIntervalMin * 60 * 1000) {
      return { reason: 'water', label: '该喝口水啦', exercise: pickExercise('water', this.profile) };
    }

    const idle = sample.idleSec;
    const sittingMin = (now - this.sittingStartAt) / 60000;

    // 主触发：在编码工具里、停手超过阈值 → 正在等 AI，趁机活动
    if (sample.isCoding && idle >= s.aiWaitIdleSec && idle < 600) {
      return {
        reason: 'ai_wait',
        label: '在等 AI 回复？顺手做个小动作',
        exercise: pickExercise(null, this.profile)
      };
    }

    // 兜底触发：久坐太久（不管在不在编码工具），但要求此刻是停手状态，别打断
    if (sittingMin >= s.maxSittingMin && idle >= 8) {
      return {
        reason: 'long_sitting',
        label: `坐了 ${Math.round(sittingMin)} 分钟了，起来动动`,
        exercise: pickExercise('stand', this.profile)
      };
    }

    return null;
  }
}

module.exports = { ReminderEngine, pickExercise, getExercises: () => exercises };
