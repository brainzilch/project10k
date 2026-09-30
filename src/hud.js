// 画面内の日本語テロップ（DOM オーバーレイ）
import { timeline as T, video } from './config.js';

export function createHud() {
  const el = {
    root: document.getElementById('hud'),
    chip: document.getElementById('hud-chip'),
    step: document.getElementById('hud-step'),
    sub: document.getElementById('hud-sub'),
    counter: document.getElementById('hud-counter'),
    badge: document.getElementById('hud-badge'),
    photo: document.getElementById('hud-photo'),
    photoImg: document.getElementById('hud-photo-img'),
    photoNote: document.getElementById('hud-photo-note'),
    flash: document.getElementById('hud-flash'),
    bar: document.getElementById('hud-progress-bar'),
    markers: document.getElementById('hud-markers'),
  };
  // 工程の区切りマーカー
  const marks = [T.s1, T.s2, T.s3, T.s4, T.s5, T.complete, T.t1, T.t2, T.t3, T.t4, T.t5];
  marks.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'm' + (i >= 6 ? ' td' : '');
    d.style.left = `${(m[0] / video.duration) * 100}%`;
    el.markers.appendChild(d);
  });

  function fit(container) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const s = Math.min(w / 1920, h / 1080);
    el.root.style.transform = `scale(${s})`;
    el.root.style.left = `${(w - 1920 * s) / 2}px`;
    el.root.style.top = `${(h - 1080 * s) / 2}px`;
  }

  let lastPhoto = null;
  function update(state) {
    const H = state.hud;
    el.chip.textContent = H.chip;
    el.chip.className = 'chip ' + H.chipClass;
    el.step.textContent = H.step;
    el.sub.textContent = H.sub;
    el.sub.className = H.chipClass;
    if (H.showCounter) {
      const c = state.chairCount;
      el.counter.style.display = 'block';
      el.counter.innerHTML = `椅子 <span class="big">${c.total}</span> / 300 脚<div class="sub">A ${c.A}　B ${c.B}　C ${c.C}</div>`;
    } else {
      el.counter.style.display = 'none';
    }
    el.badge.style.display = H.badge ? 'block' : 'none';
    el.photo.style.display = H.showPhoto ? 'block' : 'none';
    el.photoNote.textContent = H.photoNote || '';
    el.flash.style.opacity = state.photo.flash ? String(state.photo.flash * 0.9) : '0';
    el.bar.style.width = `${(state.t / video.duration) * 100}%`;
  }
  function setPhoto(dataUrl) {
    if (dataUrl !== lastPhoto) {
      el.photoImg.src = dataUrl;
      lastPhoto = dataUrl;
    }
  }
  return { update, fit, setPhoto };
}
