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

// 动作库类别 → 大类（group）。大类决定灵狐播哪个动画（每个大类 1-2 个动画）。
const CATEGORY_GROUP = {
  eyes: 'eyecare', breathing: 'eyecare',
  shoulder_neck: 'stretch', back: 'stretch', wrist: 'stretch',
  stand: 'move', legs: 'move',
  water: 'energy'
};
function groupForCategory(cat) {
  return CATEGORY_GROUP[cat] || 'general';
}

// 用户在 onboarding 选的活动。每个 = { label, cat?, group? }：
//   - 有 cat（预设，如“远眺护眼”→eyes）→ 从动作库里挑带步骤的具体动作
//   - 无 cat（自定义如“跳绳”，或纯启发项如“俯卧撑”）→ 只给个名字，让用户自己做
//   - group：所属大类（决定动画），预设/自定义都带
function selectedActivities(profile) {
  const a = profile && Array.isArray(profile.activities) ? profile.activities : [];
  // 兼容旧数据：可能是 ['water','eyes'] 这种字符串数组
  return a.map((x) => (typeof x === 'string' ? { label: x, cat: x } : x)).filter((x) => x && x.label);
}

// 从动作库里按类别挑一个具体动作（带步骤），超时的降权
function pickFromLibrary(cat, profile) {
  let pool = cat ? exercises.filter((e) => e.category === cat) : exercises;
  if (!pool.length) pool = exercises;
  if (!pool.length) return undefined;
  const maxDur = profile?.preferredMaxDurationSec || 999;
  const weighted = pool.map((e) => ({ e, w: e.durationSec > maxDur ? 0.35 : 1 }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) return x.e;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// 自定义/无库活动 → 造一个简单的“提示卡”对象（没有步骤，让用户自己做）
function customCard(label, group, profile) {
  const dur = Math.min(profile?.preferredMaxDurationSec || 60, 120);
  return { id: 'custom:' + label, name: label, category: 'custom', group: group || 'general', durationSec: dur === 999 ? 60 : dur, steps: [], caution: '', custom: true };
}

// 给库动作附上 group（不改原对象，返回浅拷贝）
function withGroup(ex, group) {
  if (!ex) return ex;
  return Object.assign({}, ex, { group: group || groupForCategory(ex.category) });
}

// 一次休息该展示什么：先从用户选的活动里随机挑一个，
// 有 cat 的挑库里具体动作，没 cat 的给自定义卡。没选任何 → 全库随机。
// 返回的对象都带 group（决定灵狐动画）。
function chooseBreakContent(profile, preferCat) {
  const acts = selectedActivities(profile);
  if (preferCat) {
    const ex = pickFromLibrary(preferCat, profile);
    if (ex) return withGroup(ex, groupForCategory(preferCat));
  }
  if (!acts.length) return withGroup(pickFromLibrary(null, profile));
  const a = acts[Math.floor(Math.random() * acts.length)];
  if (a.cat) {
    const ex = pickFromLibrary(a.cat, profile);
    if (ex) return withGroup(ex, a.group || groupForCategory(a.cat));
  }
  return customCard(a.label, a.group, profile);
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

// 触发模型（按用户设计）：
//   1. 每 breakIntervalMin 分钟，休息才“到期”一次（不是一直盯着你）。
//   2. 到期后不马上弹，等你“停手 ≥ pauseSec 秒”出现一个自然停顿才弹。
//   3. 你在敲键盘/动鼠标时绝不弹（因为要求 idle ≥ pauseSec）。
//   4. armed：弹过一次后要先“回去工作”（idle 掉到很低）才会重新武装，
//      于是“等一下”= 关掉卡片、等你下一次停顿再弹。
class ReminderEngine {
  constructor(settings, profile) {
    this.settings = settings;
    this.profile = profile || null;
    const now = Date.now();
    this.lastBreakAt = now;   // 上次休息到期被重置的时间（完成/跳过时重置）
    this.lastWaterAt = now;
    this.armed = true;        // 是否允许在下一个停顿弹出
  }

  updateSettings(settings) {
    this.settings = settings;
  }

  setProfile(profile) {
    this.profile = profile;
  }

  // 用户在活动（idle 很低）→ 重新武装，准备在下一次停顿提醒
  noteUserActive() {
    this.armed = true;
  }

  // 提醒已弹出 → 收起武装，直到用户重新活动
  noteReminderShown() {
    this.armed = false;
  }

  // 完成 / 跳过：重置 40 分钟到期时钟（下次休息 40 分钟后再到期）
  noteBreakTaken(exercise) {
    const now = Date.now();
    this.lastBreakAt = now;
    this.armed = false;
    if (exercise?.category === 'water') this.lastWaterAt = now;
  }

  // “等一下”：不重置到期时钟，只是收起武装，等下一次停顿再弹
  noteWait() {
    this.armed = false;
  }

  // 核心决策。传入一次采样，返回 null（不提醒）或 { reason, exercise }
  decide(sample) {
    const s = this.settings;
    const now = Date.now();
    const idle = sample.idleSec;

    if (inDnd(s)) return null;

    // 场景保护：全屏（看视频/放映/共享屏幕）或会议 App 在前台 → 一律不弹
    if (sample.isFullscreen || sample.isExcluded) return null;

    // 编码工具里的停顿大概率是在等 AI —— 用一半的判定时间更快抓住这个间隙；
    // 其他场景用完整判定时间，宁慢勿扰。
    const pauseSec = sample.isCoding ? Math.max(10, Math.round(s.pauseSec / 2)) : s.pauseSec;

    // 关键前置：必须此刻是“停手 ≥ pauseSec 秒”的自然停顿，且已武装。
    // 这两条保证：敲键盘时不弹、弹过一次要先回去工作才会再弹。
    if (idle < pauseSec || !this.armed) return null;
    if (idle > 900) return null; // 空闲太久（离开电脑）就不打扰了

    // 喝水兜底：太久没喝水，优先（前提：用户选了“喝水”，或没做任何选择）
    const acts = selectedActivities(this.profile);
    const cats = new Set(acts.map((a) => a.cat).filter(Boolean));
    const waterAllowed = acts.length === 0 || cats.has('water');
    if (waterAllowed && now - this.lastWaterAt > s.waterIntervalMin * 60 * 1000) {
      return { reason: 'water', label: '停一下，喝口水吧', exercise: chooseBreakContent(this.profile, 'water') };
    }

    // 休息到期：距上次休息 ≥ breakIntervalMin 分钟
    if (now - this.lastBreakAt >= s.breakIntervalMin * 60 * 1000) {
      const label = sample.isCoding
        ? '在等 AI 的话，顺手动一下 🦊'
        : '坐了一阵子了，起来动动吧 🦊';
      return { reason: 'break_due', label, exercise: chooseBreakContent(this.profile) };
    }

    return null;
  }
}

module.exports = { ReminderEngine, chooseBreakContent, getExercises: () => exercises };
