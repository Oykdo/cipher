export interface Argon2Browser {
  hash(options: {
    pass: Uint8Array | string;
    salt: Uint8Array | string;
    time: number;
    mem: number;
    parallelism: number;
    hashLen: number;
    type: number;
  }): Promise<{ hash: Uint8Array; hashHex?: string; encoded?: string }>;
  ArgonType?: {
    Argon2id?: number;
  };
}

let argon2Promise: Promise<Argon2Browser> | null = null;

function hasArgon2Hash(candidate: unknown): candidate is Argon2Browser {
  return typeof (candidate as Argon2Browser | undefined)?.hash === 'function';
}

function globalArgon2(): Argon2Browser | null {
  const g = typeof self !== 'undefined' ? (self as any) : (globalThis as any);
  return hasArgon2Hash(g.argon2) ? g.argon2 : null;
}

function resolveArgon2(moduleValue: any): Argon2Browser | null {
  const candidates = [moduleValue?.default, moduleValue?.argon2, moduleValue, globalArgon2()];
  return candidates.find(hasArgon2Hash) ?? null;
}

async function loadArgon2(): Promise<Argon2Browser> {
  try {
    const bundled = resolveArgon2(await import('argon2-browser/dist/argon2-bundled.min.js'));
    if (bundled) return bundled;
  } catch {
    // Try the package entry below.
  }

  try {
    const main = resolveArgon2(await import('argon2-browser'));
    if (main) return main;
  } catch {
    // Report a stable, user-facing initialization error below.
  }

  throw new Error('Failed to load argon2-browser. WASM may not be supported.');
}

export function getArgon2(): Promise<Argon2Browser> {
  argon2Promise ??= loadArgon2().catch((error) => {
    argon2Promise = null;
    throw error;
  });

  return argon2Promise;
}
