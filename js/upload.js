// upload.js — slide 3 is now a click-through NeRF process overview.

export function initUpload() {
  const root = document.getElementById('process-slide');
  if (!root) return { tick() {} };

  const board = root.querySelector('.process-board');
  const steps = Array.from(root.querySelectorAll('.process-step'));
  const dots = Array.from(root.querySelectorAll('.process-dot'));
  const next = document.getElementById('process-next');
  const videos = Array.from(root.querySelectorAll('video'));
  let active = 0;

  for (const v of videos) {
    v.muted = true;
    v.loop = true;
    v.preload = 'auto';
    v.load();
  }

  function syncMedia() {
    for (const v of videos) {
      const visible = v.closest('.process-step')?.classList.contains('active');
      if (visible) {
        if (v.paused || v.readyState < 2) v.play().catch(() => {});
      } else {
        v.pause();
      }
    }
  }

  function setStep(idx) {
    active = (idx + steps.length) % steps.length;
    steps.forEach((step, i) => step.classList.toggle('active', i === active));
    dots.forEach((dot, i) => dot.classList.toggle('active', i === active));
    syncMedia();
  }

  function advance() {
    setStep(active + 1);
  }

  dots.forEach((dot) => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      setStep(Number(dot.dataset.step || 0));
    });
  });
  next?.addEventListener('click', (e) => {
    e.stopPropagation();
    advance();
  });
  board?.addEventListener('click', advance);
  board?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advance();
    }
  });

  setStep(0);

  return {
    enter() { syncMedia(); },
    tick(visible) {
      if (visible) syncMedia();
      else videos.forEach(v => v.pause());
    },
  };
}
