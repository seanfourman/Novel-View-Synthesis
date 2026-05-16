// app.js — entry point: scroll/keyboard navigation, slide visibility tracking,
// renders each slide's 3D scene only while visible.

import {
  initTitleBg, initQuestion, initMultiView, initOldApproaches,
  initBunny, initRayDemo, initTraining, initClickableViews,
  initOrbitScrubber, initEndBg,
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
  b.title = 'Slide ' + (i + 1);
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

// scroll-snap handles wheel naturally, but we also want one-wheel-tick = one
// slide and arrow keys
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

// touch
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
      // lazy-init the scene for that slide
      ensureSlideInit(idx);
      // fire enter()
      const inst = sceneInstances[idx];
      if (inst && inst.enter && !inst._entered) {
        inst.enter();
        inst._entered = true;
      }
    } else {
      // reset entered flag so re-entering replays animations
      const inst = sceneInstances[parseInt(entry.target.dataset.id, 10) - 1];
      if (inst) inst._entered = false;
    }
  }
}, { root: deck, threshold: [0, 0.4, 0.55, 0.9] });

slides.forEach(s => observer.observe(s));

// mark first slide visible immediately
slides[0].classList.add('visible');

function updateChrome() {
  document.getElementById('cur').textContent = currentIdx + 1;
  document.getElementById('progress-fill').style.width =
    ((currentIdx + 1) / total) * 100 + '%';
  dots.forEach((d, i) => d.classList.toggle('active', i === currentIdx));
}

/* ===================== Scene instantiation ===================== */
// Each slide that has WebGL content has a lazy initializer. We only build
// the Three.js context when the slide first becomes visible.
const sceneRegistry = {
  0:  initTitleBg,
  1:  initQuestion,
  2:  initMultiView,
  5:  initOldApproaches,
  7:  initBunny,
  9:  initRayDemo,
  10: initTraining,
  11: initClickableViews,
  12: initOrbitScrubber,
  15: initEndBg,
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

// init first slide immediately
ensureSlideInit(0);

/* ===================== Render loop ===================== */
function loop() {
  for (const key of Object.keys(sceneInstances)) {
    const inst = sceneInstances[key];
    if (!inst) continue;
    const idx = parseInt(key, 10);
    // render if slide is current OR adjacent (to avoid first-frame flash)
    const visible = Math.abs(idx - currentIdx) <= 1;
    try {
      inst.tick(visible);
    } catch (err) {
      console.error('tick error on slide', idx + 1, err);
    }
  }
  requestAnimationFrame(loop);
}
loop();

updateChrome();

console.log('Novel View Synthesis deck ready — ' + total + ' slides.');
