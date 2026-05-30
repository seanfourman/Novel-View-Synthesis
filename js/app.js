// app.js - entry point: scroll/keyboard navigation and slide visibility tracking.

import {
  initTitleBg,
  initSpatialTransition,
  initProblemVis,
  initStaticToSpatial,
  initDepthBasedNVS,
  initClassic,
  initEndBg,
  initSfMLiDAR,
  initLimits,
  initNvsIntro,
  initSRN,
  initSRNNetAnim,
  initNeRFIntro,
  initNeRFVideo,
} from "./slides.js";

const deck = document.getElementById("deck");
const slides = Array.from(document.querySelectorAll(".slide"));
const total = slides.length;
document.getElementById("tot").textContent = total;

/* ===================== Dots nav ===================== */
const dotsContainer = document.getElementById("dots");
slides.forEach((_, i) => {
  const b = document.createElement("button");
  b.className = "dot";
  b.title = "שקף " + (i + 1);
  b.addEventListener("click", () => goTo(i));
  dotsContainer.appendChild(b);
});
const dots = Array.from(dotsContainer.children);

/* ===================== Navigation ===================== */
let currentIdx = 0;

function goTo(idx) {
  idx = Math.max(0, Math.min(total - 1, idx));
  slides[idx].scrollIntoView({ behavior: "smooth" });
}

let wheelLock = false;
deck.addEventListener(
  "wheel",
  (e) => {
    if (wheelLock) {
      e.preventDefault();
      return;
    }
    if (Math.abs(e.deltaY) < 8) return;
    wheelLock = true;
    setTimeout(() => {
      wheelLock = false;
    }, 650);
    if (e.deltaY > 0) goTo(currentIdx + 1);
    else goTo(currentIdx - 1);
    e.preventDefault();
  },
  { passive: false },
);

window.addEventListener("keydown", (e) => {
  // ignore when typing into an input/textarea (e.g. file picker dialogs)
  if (e.target.matches("input, textarea")) return;
  if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
    e.preventDefault();
    goTo(currentIdx + 1);
  } else if (e.key === "ArrowUp" || e.key === "PageUp") {
    e.preventDefault();
    goTo(currentIdx - 1);
  } else if (e.key === "Home") {
    goTo(0);
  } else if (e.key === "End") {
    goTo(total - 1);
  }
});

let touchY = null;
deck.addEventListener("touchstart", (e) => {
  touchY = e.touches[0].clientY;
});
deck.addEventListener("touchend", (e) => {
  if (touchY == null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dy) > 40) {
    if (dy < 0) goTo(currentIdx + 1);
    else goTo(currentIdx - 1);
  }
  touchY = null;
});

/* ===================== Visibility tracking ===================== */
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const idx = parseInt(entry.target.dataset.id, 10) - 1;
      if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
        currentIdx = idx;
        slides[idx].classList.add("visible");
        updateChrome();
        ensureSlideInit(idx);
        const inst = sceneInstances[idx];
        if (inst && inst.enter && !inst._entered) {
          try {
            inst.enter();
          } catch (e) {
            console.error(e);
          }
          inst._entered = true;
        }
      } else {
        const inst = sceneInstances[parseInt(entry.target.dataset.id, 10) - 1];
        if (inst) inst._entered = false;
      }
    }
  },
  { root: deck, threshold: [0, 0.4, 0.55, 0.9] },
);

slides.forEach((s) => observer.observe(s));
slides[0].classList.add("visible");

function updateChrome() {
  document.getElementById("cur").textContent = currentIdx + 1;
  document.getElementById("progress-fill").style.width =
    ((currentIdx + 1) / total) * 100 + "%";
  dots.forEach((d, i) => d.classList.toggle("active", i === currentIdx));
}

/* ===================== Scene instantiation ===================== */
const sceneRegistry = {
  0: initTitleBg, // slide 1
  1: initSpatialTransition, // slide 2 (animated horizon grid)
  2: initProblemVis, // slide 3
  3: initStaticToSpatial, // slide 4
  // slide 5 (live room tour) - iframes only
  5: initClassic, // slide 6
  6: initSfMLiDAR, // slide 7
  7: initLimits, // slide 8 (why classical methods failed)
  8: initNvsIntro, // slide 9 (transition to NVS + model timeline)
  9: initSRN, // slide 10 (SRN)
  10: initSRNNetAnim, // slide 11 (SRN network animation)
  // slide 12 (SRN pros & cons) - no canvas
  12: initNeRFIntro, // slide 13 (NeRF)
  13: initNeRFVideo, // slide 14 (NeRF pipeline animation)
  14: initDepthBasedNVS, // slide 15
  15: initEndBg, // slide 16 (final recap)
};

const sceneInstances = {};

function ensureSlideInit(idx) {
  if (sceneInstances[idx] !== undefined) return;
  const init = sceneRegistry[idx];
  if (!init) {
    sceneInstances[idx] = null;
    return;
  }
  try {
    sceneInstances[idx] = init();
  } catch (err) {
    console.error("failed to init slide", idx + 1, err);
    sceneInstances[idx] = null;
  }
}

ensureSlideInit(0);
ensureSlideInit(1);
ensureSlideInit(2);
ensureSlideInit(3);

const initialHashTarget = window.location.hash
  ? document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
  : null;
if (initialHashTarget && initialHashTarget.classList.contains("slide")) {
  requestAnimationFrame(() => {
    initialHashTarget.scrollIntoView({ behavior: "auto", block: "start" });
  });
}

/* ===================== Render loop ===================== */
// dtScale normalizes frame-based animations across devices: 1.0 at 60Hz,
// 0.5 at 120Hz, 2.0 at 30Hz. Per-tick increments multiply by it so animation
// speed matches wall-clock time regardless of refresh rate.
// Clamped to absorb tab-switch / first-frame stalls.
let lastFrameTime = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  const dtScale = dt * 60;

  for (const key of Object.keys(sceneInstances)) {
    const inst = sceneInstances[key];
    if (!inst) continue;
    const idx = parseInt(key, 10);
    const visible = Math.abs(idx - currentIdx) <= 1;
    try {
      inst.tick(visible, dtScale);
    } catch (err) {
      console.error("tick error slide", idx + 1, err);
    }
  }
  requestAnimationFrame(loop);
}
loop();
updateChrome();

console.log("Novel View Synthesis deck ready - " + total + " slides.");
