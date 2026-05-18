// app.js — entry point: scroll/keyboard navigation and slide visibility tracking.

import {
  initTitleBg, initDepthBasedNVS, initApplications, initWhyHard, initClassic,
  initOldApproaches, initRotatable, initRayDemo, initTraining,
  initClickableViews, initOrbitScrubber, initEndBg,
} from './slides.js';

const deck = document.getElementById('deck');
const slides = Array.from(document.querySelectorAll('.slide'));
const total = slides.length;
document.getElementById('tot').textContent = total;

/* ===================== Dots nav ===================== */
const dotsContainer = document.getElementById('dots');
slides.forEach((_, i) => {
  const b = document.createElement('button');
  b.className = 'dot';
  b.title = 'שקף ' + (i + 1);
  b.addEventListener('click', () => goTo(i));
  dotsContainer.appendChild(b);
});
const dots = Array.from(dotsContainer.children);

/* ===================== Navigation ===================== */
let currentIdx = 0;

function goTo(idx) {
  idx = Math.max(0, Math.min(total - 1, idx));
  slides[idx].scrollIntoView({ behavior: 'smooth' });
}

let wheelLock = false;
deck.addEventListener('wheel', (e) => {
  if (wheelLock) { e.preventDefault(); return; }
  if (Math.abs(e.deltaY) < 8) return;
  wheelLock = true;
  setTimeout(() => { wheelLock = false; }, 650);
  if (e.deltaY > 0) goTo(currentIdx + 1);
  else goTo(currentIdx - 1);
  e.preventDefault();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  // ignore when typing into an input/textarea (e.g. file picker dialogs)
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault(); goTo(currentIdx + 1);
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault(); goTo(currentIdx - 1);
  } else if (e.key === 'Home') {
    goTo(0);
  } else if (e.key === 'End') {
    goTo(total - 1);
  }
});

let touchY = null;
deck.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; });
deck.addEventListener('touchend', (e) => {
  if (touchY == null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dy) > 40) {
    if (dy < 0) goTo(currentIdx + 1);
    else goTo(currentIdx - 1);
  }
  touchY = null;
});

/* ===================== Visibility tracking ===================== */
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const idx = parseInt(entry.target.dataset.id, 10) - 1;
    if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
      currentIdx = idx;
      slides[idx].classList.add('visible');
      updateChrome();
      ensureSlideInit(idx);
      const inst = sceneInstances[idx];
      if (inst && inst.enter && !inst._entered) {
        try { inst.enter(); } catch (e) { console.error(e); }
        inst._entered = true;
      }
    } else {
      const inst = sceneInstances[parseInt(entry.target.dataset.id, 10) - 1];
      if (inst) inst._entered = false;
    }
  }
}, { root: deck, threshold: [0, 0.4, 0.55, 0.9] });

slides.forEach(s => observer.observe(s));
slides[0].classList.add('visible');

function updateChrome() {
  document.getElementById('cur').textContent = currentIdx + 1;
  document.getElementById('progress-fill').style.width =
    ((currentIdx + 1) / total) * 100 + '%';
  dots.forEach((d, i) => d.classList.toggle('active', i === currentIdx));
}

/* ===================== Scene instantiation ===================== */
const sceneRegistry = {
  0:  initTitleBg,        // slide 1
  // slide 2 (spatial transition) — no canvas
  // slide 3 (live viewer comparison) — iframes only
  3:  initDepthBasedNVS,  // slide 4
  4:  initApplications,   // slide 5
  5:  initWhyHard,        // slide 6
  6:  initClassic,        // slide 7
  // slide 8 (NeRF intro) — no canvas
  8:  initRotatable,      // slide 9
  10: initRayDemo,        // slide 11
  11: initTraining,       // slide 12
  12: initClickableViews, // slide 13
  13: initOrbitScrubber,  // slide 14
  16: initEndBg,          // slide 17
};

const sceneInstances = {};

function ensureSlideInit(idx) {
  if (sceneInstances[idx] !== undefined) return;
  const init = sceneRegistry[idx];
  if (!init) { sceneInstances[idx] = null; return; }
  try {
    sceneInstances[idx] = init();
  } catch (err) {
    console.error('failed to init slide', idx + 1, err);
    sceneInstances[idx] = null;
  }
}

ensureSlideInit(0);
ensureSlideInit(2);   // depth-based NVS
ensureSlideInit(3);   // applications
ensureSlideInit(4);   // why-hard
ensureSlideInit(5);   // classic

/* ===================== Render loop ===================== */
function loop() {
  for (const key of Object.keys(sceneInstances)) {
    const inst = sceneInstances[key];
    if (!inst) continue;
    const idx = parseInt(key, 10);
    const visible = Math.abs(idx - currentIdx) <= 1;
    try { inst.tick(visible); }
    catch (err) { console.error('tick error slide', idx + 1, err); }
  }
  requestAnimationFrame(loop);
}
loop();
updateChrome();

console.log('Novel View Synthesis deck ready — ' + total + ' slides.');
