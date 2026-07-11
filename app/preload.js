// 渲染进程与主进程之间的安全桥
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  // 提醒窗用
  onReminder: (cb) => ipcRenderer.on('reminder:show', (_e, data) => cb(data)),
  complete: () => ipcRenderer.send('reminder:complete'),
  wait: () => ipcRenderer.send('reminder:wait'),
  skip: () => ipcRenderer.send('reminder:skip'),
  another: () => ipcRenderer.send('reminder:another'),
  drankAlready: () => ipcRenderer.send('reminder:drank-already'),

  // 桌宠窗用
  onPetState: (cb) => ipcRenderer.on('pet:state', (_e, data) => cb(data)),
  onSay: (cb) => ipcRenderer.on('pet:say', (_e, data) => cb(data)),
  onStats: (cb) => ipcRenderer.on('stats:update', (_e, data) => cb(data)),
  onVitals: (cb) => ipcRenderer.on('pet:vitals', (_e, data) => cb(data)),
  requestStats: () => ipcRenderer.send('stats:request'),
  moveWindow: (x, y) => ipcRenderer.send('pet:move', { x, y }), // 手动拖拽
  dragEnd: () => ipcRenderer.send('pet:drag-end'),              // 拖拽结束（判断是否贴边）
  restorePet: () => ipcRenderer.send('pet:restore'),            // 贴边小图标点击恢复
  onMode: (cb) => ipcRenderer.on('pet:mode', (_e, data) => cb(data)), // mini/正常模式切换
  togglePanel: () => ipcRenderer.send('pet:toggle-panel'),      // 点击打开面板

  // 面板窗用（请求/应答式）
  getPanelData: () => ipcRenderer.invoke('panel:get'),
  saveSettings: (patch) => ipcRenderer.invoke('panel:save', patch),
  saveActivities: (activities) => ipcRenderer.invoke('panel:save-activities', activities),
  setAutostart: (on) => ipcRenderer.invoke('panel:set-autostart', on),
  doExercise: () => ipcRenderer.send('panel:do-exercise'),
  drank: () => ipcRenderer.invoke('panel:drank'),
  pause: (kind) => ipcRenderer.send('panel:pause', kind),
  resume: () => ipcRenderer.send('panel:resume'),
  away: (text) => ipcRenderer.invoke('panel:away', text),
  closePanel: () => ipcRenderer.send('panel:close'),

  // 首次问卷引导
  submitOnboarding: (answers) => ipcRenderer.send('onboarding:submit', answers),
  skipOnboarding: () => ipcRenderer.send('onboarding:skip')
});
