import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Polyfills for jsdom (IndexedDB + Blob.arrayBuffer)
// ---------------------------------------------------------------------------

if (typeof (globalThis as any).indexedDB === 'undefined') {
  type StoreConfig = { keyPath?: string };

  class MockIDBRequest<T = any> {
    result: T | undefined;
    error: any = null;

    private _onsuccess: ((this: any, ev?: any) => any) | null = null;
    private _onerror: ((this: any, ev?: any) => any) | null = null;

    __afterSuccess: Array<() => void> = [];
    __afterError: Array<() => void> = [];

    set onsuccess(fn: ((this: any, ev?: any) => any) | null) {
      this._onsuccess = fn;
    }
    get onsuccess() {
      return this._onsuccess;
    }

    set onerror(fn: ((this: any, ev?: any) => any) | null) {
      this._onerror = fn;
    }
    get onerror() {
      return this._onerror;
    }

    _fireSuccess() {
      try {
        this._onsuccess?.({ target: this });
      } finally {
        for (const cb of this.__afterSuccess) cb();
      }
    }

    _fireError() {
      try {
        this._onerror?.({ target: this });
      } finally {
        for (const cb of this.__afterError) cb();
      }
    }
  }

  class MockObjectStore {
    private map = new Map<any, any>();
    constructor(private keyPath?: string) {}

    createIndex(_name: string, _keyPath: string, _options?: any) {
      // No-op for tests
    }

    put(value: any) {
      const req = new MockIDBRequest<any>();
      queueMicrotask(() => {
        try {
          const key = this.keyPath ? value?.[this.keyPath] : undefined;
          const finalKey = key ?? value?.id ?? value?.conversationId;
          this.map.set(finalKey, value);
          req.result = value;
          req._fireSuccess();
        } catch (e) {
          req.error = e;
          req._fireError();
        }
      });
      return req as any;
    }

    get(key: any) {
      const req = new MockIDBRequest<any>();
      queueMicrotask(() => {
        req.result = this.map.get(key);
        req._fireSuccess();
      });
      return req as any;
    }

    delete(key: any) {
      const req = new MockIDBRequest<void>();
      queueMicrotask(() => {
        this.map.delete(key);
        req._fireSuccess();
      });
      return req as any;
    }

    clear() {
      const req = new MockIDBRequest<void>();
      queueMicrotask(() => {
        this.map.clear();
        req._fireSuccess();
      });
      return req as any;
    }

    getAllKeys() {
      const req = new MockIDBRequest<any[]>();
      queueMicrotask(() => {
        req.result = Array.from(this.map.keys());
        req._fireSuccess();
      });
      return req as any;
    }
  }

  class MockIDBDatabase {
    private stores = new Map<string, { store: MockObjectStore; config: StoreConfig }>();
    objectStoreNames = {
      contains: (name: string) => this.stores.has(name),
    } as any;

    createObjectStore(name: string, config: StoreConfig = {}) {
      const store = new MockObjectStore(config.keyPath);
      this.stores.set(name, { store, config });
      return store as any;
    }

    transaction(_name: string, _mode: 'readonly' | 'readwrite') {
      let pending = 0;
      let completed = false;

      const maybeComplete = () => {
        if (completed) return;
        if (pending <= 0) {
          completed = true;
          queueMicrotask(() => tx.oncomplete?.());
        }
      };

      const wrapRequest = (req: any) => {
        pending++;
        req.__afterSuccess.push(() => {
          pending--;
          maybeComplete();
        });
        req.__afterError.push(() => {
          pending--;
          tx.onerror?.({ target: req });
          maybeComplete();
        });
        return req;
      };

      const tx: any = {
        oncomplete: null,
        onerror: null,
        error: null,
        objectStore: (storeName: string) => {
          const entry = this.stores.get(storeName);
          if (!entry) throw new Error(`ObjectStore not found: ${storeName}`);
          const store = entry.store;

          return {
            put: (value: any) => wrapRequest(store.put(value)),
            get: (key: any) => wrapRequest(store.get(key)),
            delete: (key: any) => wrapRequest(store.delete(key)),
            clear: () => wrapRequest(store.clear()),
            getAllKeys: () => wrapRequest(store.getAllKeys()),
          } as any;
        },
      };

      queueMicrotask(() => maybeComplete());
      return tx;
    }
  }

  class MockIDBOpenDBRequest extends MockIDBRequest<any> {
    onupgradeneeded: ((this: any, ev?: any) => any) | null = null;
  }

  const databases = new Map<string, { db: MockIDBDatabase; version: number }>();

  (globalThis as any).indexedDB = {
    open: (name: string, version: number) => {
      const req = new MockIDBOpenDBRequest();
      queueMicrotask(() => {
        const existing = databases.get(name);
        if (!existing) {
          const db = new MockIDBDatabase();
          databases.set(name, { db, version });
          (req as any).result = db;
          (req as any).onupgradeneeded?.({ oldVersion: 0, newVersion: version, target: req });
          (req as any).onsuccess?.({ target: req });
          return;
        }

        (req as any).result = existing.db;
        if (version > existing.version) {
          const oldVersion = existing.version;
          existing.version = version;
          (req as any).onupgradeneeded?.({ oldVersion, newVersion: version, target: req });
        }
        (req as any).onsuccess?.({ target: req });
      });
      return req as any;
    },
    deleteDatabase: (name: string) => {
      databases.delete(name);
    },
  };
}

if (typeof Blob !== 'undefined' && typeof (Blob.prototype as any).arrayBuffer !== 'function') {
  (Blob.prototype as any).arrayBuffer = function () {
    const blob = this as Blob;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.onload = () => {
        const result = reader.result;
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('Unexpected FileReader result type'));
      };
      reader.readAsArrayBuffer(blob);
    });
  };
}

// Avoid argon2-browser WASM loading in Vitest/jsdom.
// Unit tests only need a stable deterministic KDF output, not real Argon2.
vi.mock('argon2-browser/dist/argon2-bundled.min.js', async () => {
  const { createHash } = await import('node:crypto');

  const ArgonType = {
    Argon2d: 0,
    Argon2i: 1,
    Argon2id: 2,
  } as const;

  type Argon2Options = {
    pass: Uint8Array | string;
    salt: Uint8Array | string;
    hashLen: number;
  };

  async function hash(options: Argon2Options) {
    const passBytes = typeof options.pass === 'string' ? Buffer.from(options.pass, 'utf8') : Buffer.from(options.pass);
    const saltBytes = typeof options.salt === 'string' ? Buffer.from(options.salt, 'utf8') : Buffer.from(options.salt);

    const digest = createHash('sha256').update(passBytes).update(saltBytes).digest();
    const out = digest.subarray(0, Math.min(options.hashLen, digest.length));

    return {
      hash: new Uint8Array(out),
      hashHex: Buffer.from(out).toString('hex'),
      encoded: 'mocked-argon2',
    };
  }

  const mod = { hash, ArgonType };
  return {
    __esModule: true,
    default: mod,
    hash,
    ArgonType,
  };
});
