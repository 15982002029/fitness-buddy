// 活动检测：系统空闲时间 + 当前前台 App。
// 核心用途：判断「你是不是正在等 AI 回复」——前台是编码工具且你停手了。
const { powerMonitor } = require('electron');

// get-windows 是 ESM-only，main 进程是 CJS，用动态 import 懒加载；
// 失败时降级为「只看空闲时间」，保证应用仍可运行（不依赖辅助功能/录屏权限）。
let activeWindowFn = null;
let activeWinTried = false;

async function loadActiveWin() {
  if (activeWinTried) return activeWindowFn;
  activeWinTried = true;
  try {
    const mod = await import('get-windows');
    activeWindowFn = mod.activeWindow || mod.default?.activeWindow || null;
  } catch (e) {
    console.warn('[activity] get-windows 不可用，降级为仅空闲检测：', e.message);
    activeWindowFn = null;
  }
  return activeWindowFn;
}

// 距离上次键鼠操作的秒数
function getIdleSeconds() {
  return powerMonitor.getSystemIdleTime();
}

// 返回 { idleSec, app, isCoding }
async function sample(codingApps) {
  const idleSec = getIdleSeconds();
  let appName = '';
  let isCoding = false;

  const fn = await loadActiveWin();
  if (fn) {
    try {
      // 关键：关掉辅助功能/录屏权限需求。我们只要前台 App 名字（走 NSWorkspace，
      // 无需任何权限），不需要窗口标题。不加这两个参数，get-windows 的辅助程序
      // 会每次调用都弹一次系统授权框（它是独立可执行文件，和 App 的授权不共享）。
      const win = await fn({ accessibilityPermission: false, screenRecordingPermission: false });
      appName = (win?.owner?.name || '').toLowerCase();
      isCoding = codingApps.some((k) => appName.includes(k));
    } catch {
      // 取窗口失败，按未知处理
    }
  }

  return { idleSec, app: appName, isCoding, hasWindowInfo: !!fn };
}

module.exports = { sample, getIdleSeconds };
