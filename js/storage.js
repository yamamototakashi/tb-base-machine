/* ===========================================================
   storage.js — localStorage pattern persistence
   =========================================================== */

const Storage = (() => {
  const KEY = 'bassmachine.patterns.v1';
  const LAST = 'bassmachine.last.v1';

  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function writeAll(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }
  function save(pattern) {
    const list = readAll();
    list.unshift(Object.assign({ savedAt: Date.now() }, pattern));
    // keep last 16
    writeAll(list.slice(0, 16));
  }
  function loadLatest() {
    const list = readAll();
    return list[0] || null;
  }
  function saveLast(pattern) {
    try { localStorage.setItem(LAST, JSON.stringify(pattern)); } catch (e) {}
  }
  function getLast() {
    try {
      const raw = localStorage.getItem(LAST);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  return { save, loadLatest, readAll, saveLast, getLast };
})();

window.Storage = Storage;
