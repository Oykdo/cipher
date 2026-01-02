export type ZKProverScheme = 'sha256-placeholder-v0';

export interface ZKRhythmPublicSignals {
  /** Number of inter-keystroke intervals used in the proof (no raw timings). */
  n: number;
  /** Quantized timing bucket to avoid leaking high-resolution behavior (coarse). */
  quantizationMs: number;
  /** Client-side thresholds used for local classification (coarse, non-identifying). */
  minRequiredIntervals: number;
}

export interface ZKRhythmProof {
  scheme: ZKProverScheme;
  proof: string;
  publicSignals: ZKRhythmPublicSignals;
}

export interface ZKRhythmInput {
  /** Inter-keystroke intervals in milliseconds (NOT sent; only used locally to build a proof). */
  intervalsMs: number[];
  /** Optional nonce to make proofs non-replayable across attempts (opaque to verifier in real ZK). */
  nonce?: string;
}

const DEFAULT_QUANTIZATION_MS = 25;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function quantizeIntervals(intervalsMs: number[], qMs: number): number[] {
  const q = Math.max(1, Math.floor(qMs));
  return intervalsMs
    .map((v) => Math.max(0, Math.round(v / q) * q))
    .slice(0, 64); // cap to keep payload bounded
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) {
    // Workaround TS BufferSource typing friction around ArrayBufferLike/SharedArrayBuffer.
    const view = new Uint8Array(data);
    const digest = await subtle.digest('SHA-256', view);
    return bytesToHex(new Uint8Array(digest));
  }

  // Vitest/jsdom fallback: Node crypto. Not used in browser builds.
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(data).digest('hex');
}

/**
 * ZK-Proof of Rhythm (prototype)
 *
 * Real design: a zkSNARK/zkVM proof that "input timings are human-like" without revealing timings.
 * Prototype: SHA-256 hash over *quantized* timing buckets (still keeps raw timings local).
 */
export async function proveRhythm(
  input: ZKRhythmInput,
  opts?: { quantizationMs?: number; minRequiredIntervals?: number },
): Promise<ZKRhythmProof> {
  const quantizationMs = opts?.quantizationMs ?? DEFAULT_QUANTIZATION_MS;
  const minRequiredIntervals = opts?.minRequiredIntervals ?? 8;

  const qIntervals = quantizeIntervals(input.intervalsMs, quantizationMs);

  const payload = {
    v: 0,
    q: quantizationMs,
    n: qIntervals.length,
    // Important: never include raw intervals; only quantized buckets.
    intervals: qIntervals,
    nonce: input.nonce ?? null,
  };

  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const proof = await sha256Hex(encoded);

  return {
    scheme: 'sha256-placeholder-v0',
    proof,
    publicSignals: {
      n: qIntervals.length,
      quantizationMs,
      minRequiredIntervals,
    },
  };
}

/**
 * Generates a "Proof of State" for high-stakes actions like staking.
 * Ensures the client isn't lying about their accumulated Rho/Aether history.
 * 
 * PROTOTYPE: Simply hashes the latest event ID to prove the chain tip.
 * REALITY: Would be a Merkle proof or ZK-Rollup style proof of validity.
 */
export async function generateProofOfState(history: { id: string }[]): Promise<string> {
  if (!history || history.length === 0) {
    return 'genesis_proof';
  }

  const tip = history[history.length - 1];
  const data = `PROOF_OF_STATE:${tip.id}:${history.length}`;
  const encoded = new TextEncoder().encode(data);
  return await sha256Hex(encoded);
}
