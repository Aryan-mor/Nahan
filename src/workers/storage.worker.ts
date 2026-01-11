
import { IDBPDatabase, openDB } from 'idb';
import { decryptWithKey, encryptWithKey } from '../services/secureStorage';

const ctx: Worker = self as unknown as Worker;

let db: IDBPDatabase | null = null;
const DB_NAME = 'nahan_secure_v1';
const DB_VERSION = 3;
const ID_PREFIX_MESSAGE = 'msg_';

interface WorkerRequest {
  id: string;
  type: 'getMessages' | 'storeMessage';
  payload: {
    // Shared
    masterKey: CryptoKey;

    // getMessages
    fingerprint?: string;
    limit?: number;
    offset?: number;

    // storeMessage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message?: any; // We'll keep it loose or import types if possible
  };
}

// Optimized Base64 to Blob conversion
const base64ToBlob = (base64: string, type = 'image/png'): Blob => {
  const binary = atob(base64.split(',')[1] || base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type });
};

const initializeDB = async () => {
  if (!db) {
    db = await openDB(DB_NAME, DB_VERSION);
  }
  return db;
};

// eslint-disable-next-line max-lines-per-function
const handleGetMessages = async (payload: WorkerRequest['payload']) => {
  const start = performance.now();
  const { fingerprint, limit, offset, masterKey } = payload;
  const db = await initializeDB();

  const prefix = `${ID_PREFIX_MESSAGE}${fingerprint}_`;
  const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);

  const tx = db.transaction('secure_vault', 'readonly');
  const store = tx.objectStore('secure_vault');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEntries: any[] = [];

  const cursorStart = performance.now();
  let cursor = await store.openCursor(range, 'prev');
  if (offset > 0 && cursor) await cursor.advance(offset);

  let scannedCount = 0;
  while (cursor && rawEntries.length < limit) {
     scannedCount++;
     // Double check prefix (bound should handle it, but for safety/perf check)
     if (cursor.value.id.startsWith(prefix)) {
       rawEntries.push(cursor.value);
     }
     cursor = await cursor.continue();
  }
  const scanDuration = performance.now() - cursorStart;

  // Parallel Decryption & Image Processing
  const decryptStart = performance.now();
  const results = await Promise.all(
    rawEntries.map(async (entry) => {
      try {
        const json = await decryptWithKey(entry.payload, masterKey);
        const msg = JSON.parse(json);

        // Convert base64 image to Blob
        // We replace the string with the Blob object.
        // The main thread will create the URL.
        if (msg.content && msg.content.image && msg.content.image.startsWith('data:')) {
           msg.content.imageBlob = base64ToBlob(msg.content.image);
           delete msg.content.image; // Remove base64 to save memory transfer
        }

        // Strict isolation check
        if (msg.recipientFingerprint === fingerprint || msg.senderFingerprint === fingerprint) {
           // Restore Dates
           if (msg.createdAt) msg.createdAt = new Date(msg.createdAt);
           return msg;
        }
      } catch (_e) {
        // console.warn('Worker decryption failed', e);
      }
      return null;
    })
  );
  const decryptDuration = performance.now() - decryptStart;

  // eslint-disable-next-line no-console
  console.log(`[PERF][Worker] getMessages('${fingerprint}') - Scan: ${scanDuration.toFixed(2)}ms (${scannedCount} items), Decrypt: ${decryptDuration.toFixed(2)}ms, Total: ${(performance.now() - start).toFixed(2)}ms`);

  return results.filter(Boolean).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

const handleStoreMessage = async (payload: WorkerRequest['payload']) => {
  const { message, masterKey } = payload;
  const db = await initializeDB();

  // Encrypt the message using the passed Master Key (pure worker logic)
  // We use encryptWithKey which we must import from secureStorage
  // Note: encryptWithKey must be available. We added it to secureStorage.ts.
  const encryptedPayload = await encryptWithKey(JSON.stringify(message), masterKey);

  const entry = {
    id: message.id,
    payload: encryptedPayload,
  };

  const tx = db.transaction('secure_vault', 'readwrite');
  await tx.objectStore('secure_vault').put(entry);
  await tx.done;

  return message;
};

ctx.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data as WorkerRequest;

  try {
    if (type === 'getMessages') {
      const result = await handleGetMessages(payload);
      ctx.postMessage({ id, success: true, data: result });
    } else if (type === 'storeMessage') {
      const result = await handleStoreMessage(payload);
      ctx.postMessage({ id, success: true, data: result });
    }
  } catch (error) {
    ctx.postMessage({ id, success: false, error: (error as Error).message });
  }
};

export { };

