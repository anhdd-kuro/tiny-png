'use strict';
const api = window.tinyPNG;
const target = document.getElementById('corner-drop');
const label = document.getElementById('corner-label');
const photo = document.getElementById('corner-photo');
const warning = document.getElementById('corner-warning');
let lastState;
let dragging = false;
let depth = 0;
let dropClickGuard = false;
function render(state) {
  if (state) lastState = state;
  if (!lastState) return;
  const jobs = lastState.jobs || [];
  const failed = jobs.filter((job) => job.state === 'failed').length;
  const pending = jobs.filter((job) => job.state === 'queued').length;
  const done = jobs.filter((job) => job.state === 'completed').length;
  const hasFailure = !dragging && !lastState.isProcessing && failed > 0;
  label.textContent = dragging ? 'Thả để nén' : lastState.isProcessing ? 'Đang nén…' : failed ? `${failed} ảnh lỗi` : pending ? `${pending} ảnh chờ` : done ? `${done} ảnh xong` : 'Thả ảnh';
  photo.hidden = hasFailure;
  warning.hidden = !hasFailure;
  target.classList.toggle('is-targeted', dragging);
  target.classList.toggle('has-error', hasFailure);
  target.setAttribute('aria-label', `Tiny PNG — ${label.textContent}. Nhấn để mở cửa sổ chính.`);
  target.title = hasFailure ? `${failed} ảnh lỗi. Nhấn để xem chi tiết.` : 'Thả ảnh hoặc thư mục để nén. Nhấn để mở Tiny PNG.';
}
function invoke(method, ...args) { return Promise.resolve().then(() => api[method](...args)).catch(() => { label.textContent = 'Không thể nén'; target.classList.add('has-error'); target.setAttribute('aria-label', 'Không thể nén ảnh. Nhấn để xem cửa sổ chính.'); }); }
target.addEventListener('click', () => { if (!dropClickGuard) invoke('openMain'); });
window.addEventListener('dragenter', (event) => { event.preventDefault(); if ([...(event.dataTransfer?.types || [])].includes('Files')) { depth++; dragging = true; render(); } });
window.addEventListener('dragover', (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
window.addEventListener('dragleave', (event) => { event.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) { dragging = false; render(); } });
window.addEventListener('drop', (event) => { event.preventDefault(); event.stopPropagation(); depth = 0; dragging = false; dropClickGuard = true; render(); if (event.dataTransfer?.files.length) invoke('enqueueFiles', [...event.dataTransfer.files]); setTimeout(() => { dropClickGuard = false; }, 250); });
if (api) { api.onState(render); invoke('getState').then((state) => { if (state) render(state); }); }
