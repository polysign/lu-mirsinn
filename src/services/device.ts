const DEVICE_ID_KEY = 'device_id';

const generateId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => {
    const random = crypto.getRandomValues(new Uint8Array(1))[0];
    const value = Number(c) ^ (random & (15 >> (Number(c) / 4)));
    return value.toString(16);
  });
};

async function openIndexedDb(): Promise<IDBDatabase | null> {
  try {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open('mir-sinn-store', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[device] Unable to open IndexedDB', err);
    return null;
  }
}

async function readId(db: IDBDatabase): Promise<string | null> {
  return new Promise(resolve => {
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const request = store.get(DEVICE_ID_KEY);
    request.onsuccess = () => resolve((request.result as string) || null);
    request.onerror = () => resolve(null);
  });
}

async function writeId(db: IDBDatabase, id: string): Promise<void> {
  return new Promise(resolve => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    store.put(id, DEVICE_ID_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getDeviceId(): Promise<string> {
  const db = await openIndexedDb();

  if (db) {
    const idbValue = await readId(db);
    if (idbValue) return idbValue;
  }

  const localValue = (() => {
    try {
      return localStorage.getItem(DEVICE_ID_KEY);
    } catch {
      return null;
    }
  })();

  if (localValue) {
    if (db) await writeId(db, localValue);
    return localValue;
  }

  const id = generateId();

  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // ignore storage failures
  }

  if (db) {
    try {
      await writeId(db, id);
    } catch {
      // ignore storage failures
    }
  }

  return id;
}

export async function ensureDeviceIdOnWindow(): Promise<string> {
  const id = await getDeviceId();
  (window as any).__DEVICE_ID__ = id;
  return id;
}
