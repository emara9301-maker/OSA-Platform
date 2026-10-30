// Records taken while the phone has no internet, kept on the phone until they can be sent.
// Two stores: attendance and reports. Each item keeps the lesson it belongs to.
export type QueueStore = "attendance" | "reports";
export type QueuedItem<T> = { id: number; sessionId: string; payload: T; savedAt: string };

const DB_NAME = "osa-offline";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      for (const name of ["attendance", "reports"]) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { autoIncrement: true });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(store: QueueStore, mode: IDBTransactionMode, action: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = action(transaction.objectStore(store));
        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

export function queueItem<T>(store: QueueStore, sessionId: string, payload: T): Promise<void> {
  return run(store, "readwrite", (objects) =>
    objects.add({ sessionId, payload, savedAt: new Date().toISOString() }),
  ).then(() => undefined);
}

export async function queuedItems<T>(store: QueueStore): Promise<QueuedItem<T>[]> {
  const keys = await run(store, "readonly", (objects) => objects.getAllKeys());
  const items = await run(store, "readonly", (objects) => objects.getAll());
  return items.map((item, index) => ({ id: Number(keys[index]), ...(item as Omit<QueuedItem<T>, "id">) }));
}

export function removeQueuedItem(store: QueueStore, id: number): Promise<undefined> {
  return run(store, "readwrite", (objects) => objects.delete(id));
}
