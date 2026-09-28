import AsyncStorage from '@react-native-async-storage/async-storage';

const K = { worker: 'sv_worker', lang: 'sv_lang', progress: 'sv_progress', results: 'sv_results', certs: 'sv_certs', queue: 'sv_sync_queue' };
async function get(k, fb) { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
async function set(k, v) { await AsyncStorage.setItem(k, JSON.stringify(v)); }

export const Store = {
  getWorker: () => get(K.worker, null),
  setWorker: (w) => set(K.worker, w),
  getLang: () => get(K.lang, 'hi'),
  setLang: (l) => set(K.lang, l),
  getProgress: () => get(K.progress, {}),
  setProgress: (p) => set(K.progress, p),
  getResults: () => get(K.results, []),
  addResult: async (r) => { const a = await get(K.results, []); a.push(r); await set(K.results, a); const q = await get(K.queue, []); q.push({ type: 'result', payload: r }); await set(K.queue, q); },
  getCerts: () => get(K.certs, []),
  addCert: async (c) => { const a = await get(K.certs, []); a.push(c); await set(K.certs, a); const q = await get(K.queue, []); q.push({ type: 'certificate', payload: c }); await set(K.queue, q); },
  getQueue: () => get(K.queue, []),
  clearQueue: () => set(K.queue, []),
};

export const BACKEND_URL = 'http://10.0.2.2:4000'; // change to LAN IP on device

export async function trySync() {
  const q = await Store.getQueue();
  if (!q.length) return { synced: 0, online: true };
  try {
    for (const item of q) {
      const path = item.type === 'result' ? '/api/results' : '/api/certificates';
      await fetch(BACKEND_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) });
    }
    await Store.clearQueue();
    return { synced: q.length, online: true };
  } catch { return { synced: 0, online: false }; }
}

export function makeCertId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `SVAR-${n}`;
}
