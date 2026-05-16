// userImage.js — global state for the photo the user uploads.
// All slides 2..7 read this and re-render whenever it changes.

const state = {
  image: null,            // HTMLCanvasElement of the source photo (clamped to MAX_SIDE)
  depth: null,            // HTMLCanvasElement grayscale, same dims as `image`
  status: 'idle',         // 'idle' | 'loading' | 'computing' | 'ready' | 'error'
  statusText: '',         // human-readable progress text
  progress: 0,            // 0..1
  errorMsg: null,
  subscribers: new Set(),
};

export function snapshot() {
  return {
    image: state.image,
    depth: state.depth,
    status: state.status,
    statusText: state.statusText,
    progress: state.progress,
    errorMsg: state.errorMsg,
  };
}

export function subscribe(fn) {
  state.subscribers.add(fn);
  try { fn(snapshot()); } catch (e) { console.error(e); }
  return () => state.subscribers.delete(fn);
}

function emit() {
  const s = snapshot();
  for (const fn of state.subscribers) {
    try { fn(s); } catch (e) { console.error(e); }
  }
}

export function setLoading(text = 'טוען תמונה...', progress = 0.05) {
  state.status = 'loading';
  state.statusText = text;
  state.progress = progress;
  emit();
}

export function setImage(imageCanvas) {
  state.image = imageCanvas;
  state.depth = null;
  state.status = 'computing';
  state.statusText = 'טוען מודל...';
  state.progress = 0.1;
  state.errorMsg = null;
  emit();
}

export function setProgress(text, progress) {
  if (state.status !== 'computing' && state.status !== 'loading') return;
  if (text != null) state.statusText = text;
  if (progress != null) state.progress = progress;
  emit();
}

export function setDepth(depthCanvas) {
  state.depth = depthCanvas;
  state.status = 'ready';
  state.statusText = 'מוכן';
  state.progress = 1;
  emit();
}

export function setError(msg) {
  state.status = 'error';
  state.errorMsg = msg || 'אירעה שגיאה';
  emit();
}

export function reset() {
  state.image = null;
  state.depth = null;
  state.status = 'idle';
  state.statusText = '';
  state.progress = 0;
  state.errorMsg = null;
  emit();
}
