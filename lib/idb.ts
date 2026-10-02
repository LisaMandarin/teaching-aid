// An IndexedDB object store keyed by `id`, for files too big for localStorage (教材, 立可拍's photos).
// Returns `run`, which does one request on the store and resolves once its transaction is done.

export type RunInStore = <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) => Promise<T>;

export function objectStore(dbName: string, storeName: string): RunInStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const openDb = (): Promise<IDBDatabase> => {
    dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  };

  return async (mode, fn) => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
}
