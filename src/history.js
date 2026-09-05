const DEFAULT_KEY = "dbml-editor-session";
const MAX_STEPS = 80;

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function statesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isEmptyState(state) {
  return !state || (!state.zones?.length && !state.tables?.length && !state.refs?.length);
}

export function createSession(storage, key = DEFAULT_KEY) {
  let current = null;
  let past = [];
  let future = [];

  function reset(state) {
    current = cloneState(state);
    past = [];
    future = [];
  }

  function commit(state) {
    const next = cloneState(state);
    if (!current) {
      current = next;
      return false;
    }
    if (statesEqual(current, next)) return false;
    past.push(current);
    if (past.length > MAX_STEPS) past.shift();
    current = next;
    future = [];
    return true;
  }

  function undo() {
    if (!past.length) return null;
    future.push(current);
    current = past.pop();
    return cloneState(current);
  }

  function redo() {
    if (!future.length) return null;
    past.push(current);
    current = future.pop();
    return cloneState(current);
  }

  function snapshot() {
    return cloneState(current);
  }

  function touch(state) {
    current = cloneState(state);
  }

  function canUndo() {
    return past.length > 0;
  }

  function canRedo() {
    return future.length > 0;
  }

  function recoverEmptyCurrent() {
    if (!isEmptyState(current)) return;
    for (let i = past.length - 1; i >= 0; i -= 1) {
      if (!isEmptyState(past[i])) {
        current = past[i];
        past = past.slice(0, i);
        future = [];
        return;
      }
    }
  }

  function persist(meta) {
    if (!storage) return;
    if (meta.state && !isEmptyState(meta.state)) {
      current = cloneState(meta.state);
    }
    recoverEmptyCurrent();
    const envelope = () => ({
      version: 1,
      filename: meta.filename,
      mode: meta.mode,
      selected: meta.selected,
      catalogToggle: meta.catalogToggle || {},
      savedJson: meta.savedJson,
      zoom: meta.zoom,
      panX: meta.panX,
      panY: meta.panY,
      current,
      past,
      future,
    });
    try {
      storage.setItem(key, JSON.stringify(envelope()));
    } catch {
      past = past.slice(-20);
      try {
        storage.setItem(key, JSON.stringify(envelope()));
      } catch {
        /* квота браузера кончилась */
      }
    }
  }

  function restore() {
    if (!storage) return null;
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.current) return null;
      current = data.current;
      past = Array.isArray(data.past) ? data.past : [];
      future = Array.isArray(data.future) ? data.future : [];
      recoverEmptyCurrent();
      return data;
    } catch {
      return null;
    }
  }

  function clear() {
    current = null;
    past = [];
    future = [];
    try {
      storage?.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  return { reset, commit, undo, redo, snapshot, touch, canUndo, canRedo, persist, restore, clear };
}
