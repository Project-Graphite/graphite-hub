import * as Y from 'yjs';

const STORE = 'updates';
const COMPACT_AT = 500;

function done<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class LocalDraft {
  private database: IDBDatabase | undefined;
  private pending: Uint8Array[] = [];
  private writing = false;
  private closed = false;
  private readonly name: string;
  private readonly document: Y.Doc;
  readonly ready: Promise<boolean>;

  constructor(name: string, document: Y.Doc) {
    this.name = name;
    this.document = document;
    this.ready = this.open();
    document.on('update', this.updated);
  }

  private updated = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.closed) {
      return;
    }
    this.pending.push(update);
    void this.flush();
  };

  private async open() {
    try {
      const request = indexedDB.open(this.name);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { autoIncrement: true });
      };
      const database = await done(request);
      const stored = await done(database.transaction(STORE).objectStore(STORE).getAll());
      if (stored.length > 0) {
        Y.applyUpdate(this.document, Y.mergeUpdates(stored as Uint8Array[]), this);
      }
      this.database = database;
      void this.flush();
      return true;
    } catch {
      return false;
    }
  }

  private async flush() {
    if (!this.database || this.writing || this.pending.length === 0) {
      return;
    }
    this.writing = true;
    const batch = Y.mergeUpdates(this.pending);
    this.pending = [];
    try {
      const store = this.database.transaction(STORE, 'readwrite').objectStore(STORE);
      await done(store.add(batch));
      if ((await done(store.count())) >= COMPACT_AT) {
        const all = await done(store.getAll());
        await done(store.clear());
        await done(store.add(Y.mergeUpdates(all as Uint8Array[])));
      }
    } catch {
      this.pending.unshift(batch);
    } finally {
      this.writing = false;
      if (this.pending.length > 0) {
        void this.flush();
      }
    }
  }

  destroy() {
    this.closed = true;
    this.document.off('update', this.updated);
    this.database?.close();
  }
}
