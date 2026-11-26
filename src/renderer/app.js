'use strict';

const api = window.tinyPNG;
const $ = (id) => document.getElementById(id);
let currentState;
let dragDepth = 0;
let lastAnnouncement = '';
const dialog = $('settings-dialog');
const friendlyState = { queued: 'Đang chờ', processing: 'Đang nén…', completed: 'Hoàn tất', failed: 'Lỗi' };
const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: unit ? 1 : 0 }).format(bytes / (1024 ** unit))} ${['B', 'KB', 'MB', 'GB'][unit]}`;
};
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function actionButton(action, label, id, className = 'row-action', visibleText = label) {
  const button = element('button', className, visibleText);
  button.type = 'button';
  button.dataset.action = action;
  if (id) button.dataset.id = id;
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}
function showError(error) {
  $('notice-text').textContent = error?.message || 'Không thể thực hiện. Hãy thử lại.';
  $('notice').hidden = false;
}
function call(method, ...args) {
  return Promise.resolve().then(() => api[method](...args)).catch(showError);
}
function fileIcon(failed) {
  const icon = element('span', 'file-icon');
  icon.setAttribute('aria-hidden', 'true');
  if (failed) { icon.textContent = '!'; return icon; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm0 14 5-5 4 4 3-3 5 6M9 8h.01');
  svg.append(path); icon.append(svg); return icon;
}
function renderJobs(jobs) {
  const activeButton = document.activeElement?.dataset;
  const focusKey = activeButton?.action ? { action: activeButton.action, id: activeButton.id } : null;
  const fragment = document.createDocumentFragment();
  for (const job of jobs) {
    const row = element('li', 'job-row');
    row.append(fileIcon(job.state === 'failed'));
    const info = element('div', 'job-info');
    const name = element('span', 'file-name', job.name || 'Ảnh');
    name.title = job.source || job.name || '';
    info.append(name);
    const meta = element('div', 'file-meta');
    meta.append(element('span', `original-size${job.state === 'completed' ? ' complete' : ''}`, formatBytes(job.originalBytes)));
    if (job.result) meta.append(element('span', 'output-size', formatBytes(job.result.outputBytes)));
    info.append(meta);
    if (job.error) info.append(element('p', 'job-error', job.error));
    row.append(info);
    if (job.state === 'processing') {
      const spinner = element('span', 'spinner');
      spinner.setAttribute('aria-label', 'Đang nén');
      row.append(spinner);
    } else if (job.result) {
      const result = element('div', 'job-result');
      const original = job.result.originalBytes || job.originalBytes;
      const percent = original > 0 ? Math.max(0, Math.round((original - job.result.outputBytes) / original * 100)) : 0;
      result.append(element('span', 'saved-value', job.result.skipped ? 'Không giảm thêm' : `−${percent}%`));
      if (job.result.outputPath) result.append(actionButton('reveal', `Hiện ${job.name} trong Finder`, job.id, 'reveal-button', 'Hiện trong Finder'));
      row.append(result);
    } else if (job.state === 'queued') row.append(element('span', 'job-state', friendlyState.queued));
    if (job.state === 'failed') row.append(actionButton('retry', `Thử lại ${job.name}`, job.id, 'row-action', '↻'));
    if (job.state !== 'processing') row.append(actionButton('remove', `Xóa ${job.name} khỏi danh sách`, job.id, 'row-action', '×'));
    fragment.append(row);
  }
  $('job-list').replaceChildren(fragment);
  if (focusKey) {
    const next = [...$('job-list').querySelectorAll('button')].find((button) => button.dataset.action === focusKey.action && button.dataset.id === focusKey.id);
    next?.focus({ preventScroll: true });
  }
}
function updateControl(id, value) {
  const control = $(id);
  if (document.activeElement === control) return;
  if (control.type === 'checkbox') control.checked = !!value;
  else control.value = value;
}
function renderSettings(settings, state) {
  const values = { 'corner-enabled': settings.cornerEnabled, 'drop-corner': settings.dropCorner, overwrite: settings.overwrite, format: settings.format, quality: settings.quality, 'resize-enabled': settings.resizeEnabled, 'resize-method': settings.resizeMethod, width: settings.width, height: settings.height };
  for (const [id, value] of Object.entries(values)) updateControl(id, value);
  $('quality-value').textContent = settings.quality;
  $('resize-fields').disabled = !settings.resizeEnabled || state.isProcessing;
  $('height-field').hidden = settings.resizeMethod === 'scale';
  $('watch-path').textContent = settings.watchPath || 'Chưa chọn thư mục';
  $('watch-path').title = settings.watchPath || '';
  $('output-path').textContent = settings.outputDirectory || 'Cùng thư mục ảnh gốc';
  $('output-path').title = settings.outputDirectory || '';
  $('reset-output').hidden = !settings.outputDirectory;
  $('watch-toggle').textContent = state.watchRunning ? 'Dừng' : 'Bắt đầu';
  for (const id of ['overwrite', 'format', 'quality', 'resize-enabled', 'choose-output', 'reset-output']) $(id).disabled = state.isProcessing;
  $('drop-corner').disabled = !settings.cornerEnabled;
}
function render(state) {
  if (!state?.settings || !Array.isArray(state.jobs)) return;
  currentState = state;
  const jobs = state.jobs;
  const completed = jobs.filter((job) => job.state === 'completed');
  const pending = jobs.filter((job) => job.state === 'queued').length;
  const failed = jobs.filter((job) => job.state === 'failed').length;
  const saved = completed.reduce((total, job) => total + Math.max(0, job.result?.savedBytes ?? (job.originalBytes - (job.result?.outputBytes ?? job.originalBytes))), 0);
  const original = completed.reduce((total, job) => total + (job.result?.originalBytes || job.originalBytes || 0), 0);
  document.body.classList.toggle('has-jobs', jobs.length > 0);
  $('queue-section').hidden = jobs.length === 0;
  $('job-count').textContent = jobs.length;
  $('retry-all').hidden = failed === 0;
  $('clear-finished').disabled = !jobs.some((job) => ['failed', 'completed'].includes(job.state));
  $('summary-primary').textContent = completed.length ? `Đã tiết kiệm ${formatBytes(saved)}` : state.isProcessing ? 'Đang nén ảnh…' : failed ? `${failed} ảnh cần thử lại` : 'Sẵn sàng nén ảnh';
  $('summary-secondary').textContent = completed.length ? `${completed.length} ảnh · giảm ${original ? Math.round(saved / original * 100) : 0}%` : 'Xử lý trên máy của bạn';
  document.querySelector('.summary').classList.toggle('has-savings', completed.length > 0);
  $('queue-control').textContent = state.isProcessing ? state.paused ? 'Đang tạm dừng…' : 'Tạm dừng' : pending ? `Nén ${pending} ảnh` : 'Thêm ảnh';
  $('queue-control').disabled = state.isProcessing && state.paused;
  $('watch-status').hidden = !state.watchRunning;
  $('watch-status').textContent = state.watchRunning ? 'Đang theo dõi thư mục' : '';
  $('watch-status').title = state.settings.watchPath || '';
  $('notice').hidden = !state.notice;
  $('notice-text').textContent = state.notice || '';
  renderJobs(jobs);
  renderSettings(state.settings, state);
  const announcement = `${completed.length} ảnh hoàn tất, ${failed} ảnh lỗi, ${pending} ảnh đang chờ.`;
  if (announcement !== lastAnnouncement) { $('live-status').textContent = announcement; lastAnnouncement = announcement; }
}
function openSettings() { if (!dialog.open) dialog.showModal(); }
for (const id of ['settings-open', 'watch-status']) $(id).addEventListener('click', openSettings);
for (const id of ['settings-close', 'settings-done']) $(id).addEventListener('click', () => dialog.close());
$('drop-zone').addEventListener('click', () => call('chooseFiles'));
$('queue-control').addEventListener('click', () => call(currentState?.isProcessing ? 'pause' : currentState?.jobs.some((job) => job.state === 'queued') ? 'resume' : 'chooseFiles'));
$('clear-finished').addEventListener('click', () => call('clearFinished'));
$('retry-all').addEventListener('click', async () => { for (const job of currentState.jobs.filter((item) => item.state === 'failed')) await call('retry', job.id); });
$('notice-close').addEventListener('click', () => { $('notice').hidden = true; call('dismissNotice'); });
$('choose-watch').addEventListener('click', () => call('chooseWatchFolder'));
$('watch-toggle').addEventListener('click', () => call(currentState?.watchRunning ? 'stopWatch' : 'startWatch'));
$('choose-output').addEventListener('click', () => call('chooseOutputFolder'));
$('reset-output').addEventListener('click', () => call('updateSettings', { outputDirectory: null }));
$('job-list').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const job = currentState.jobs.find((item) => item.id === button.dataset.id);
  if (!job) return;
  if (button.dataset.action === 'reveal') { if (job.result?.outputPath) call('reveal', job.result.outputPath); }
  else call(button.dataset.action, job.id);
});
const settingMap = { 'corner-enabled': 'cornerEnabled', 'drop-corner': 'dropCorner', overwrite: 'overwrite', format: 'format', quality: 'quality', 'resize-enabled': 'resizeEnabled', 'resize-method': 'resizeMethod', width: 'width', height: 'height' };
for (const [id, key] of Object.entries(settingMap)) {
  $(id).addEventListener('change', (event) => {
    const control = event.target;
    let value = control.type === 'checkbox' ? control.checked : ['number', 'range'].includes(control.type) ? Number(control.value) : control.value;
    if (control.type === 'number' && (!Number.isInteger(value) || value < 1 || value > 32768)) { control.reportValidity(); renderSettings(currentState.settings, currentState); return; }
    if (key === 'overwrite' && value && !window.confirm('Ảnh đã nén sẽ thay thế file gốc. Bật ghi đè ảnh gốc?')) { control.checked = false; return; }
    call('updateSettings', { [key]: value });
  });
}
$('quality').addEventListener('input', (event) => { $('quality-value').textContent = event.target.value; });
function clearDropHighlight() { dragDepth = 0; $('drop-zone').classList.remove('is-targeted'); $('drop-label').textContent = 'Kéo ảnh vào đây'; }
window.addEventListener('dragenter', (event) => { event.preventDefault(); if ([...(event.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('drop-zone').classList.add('is-targeted'); $('drop-label').textContent = 'Thả ảnh để bắt đầu'; } });
window.addEventListener('dragover', (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
window.addEventListener('dragleave', (event) => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) clearDropHighlight(); });
window.addEventListener('drop', (event) => { event.preventDefault(); event.stopPropagation(); clearDropHighlight(); if (event.dataTransfer?.files.length) call('enqueueFiles', [...event.dataTransfer.files]); });
window.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); call('chooseFiles'); } if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); openSettings(); } });
if (api) { api.onState(render); api.onOpenSettings?.(openSettings); call('getState').then((state) => { if (state) render(state); }); }
else { showError(new Error('Không thể kết nối với ứng dụng. Hãy đóng và mở lại Tiny PNG.')); }
