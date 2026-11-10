// Small key-value store on IndexedDB. Values go through structured clone,
// so typed arrays and directory handles are kept as they are.

const DB_NAME = 'dnd-dice-stamp';
const STORE = 'kv';

let opening = null;

function open() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

async function run(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

export function cacheGet(key) {
  return run('readonly', (store) => store.get(key));
}

export function cacheSet(key, value) {
  return run('readwrite', (store) => store.put(value, key));
}

export function cacheDel(key) {
  return run('readwrite', (store) => store.delete(key));
}
