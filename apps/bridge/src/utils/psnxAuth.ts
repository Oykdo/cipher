import { hkdfSync, createHash, randomBytes } from 'crypto';
import { readFile } from 'fs/promises';

const SCHNORR_P = BigInt(
  `0x${[
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1',
    '29024E088A67CC74020BBEA63B139B22514A08798E3404DD',
    'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245',
    'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED',
    'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D',
    'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F',
    '83655D23DCA3AD961C62F356208552BB9ED529077096966D',
    '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B',
    'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9',
    'DE2BCBF6955817183995497CEA956AE515D2261898FA0510',
    '15728E5A8AACAA68FFFFFFFFFFFFFFFF',
  ].join('')}`,
);
const SCHNORR_Q = (SCHNORR_P - 1n) / 2n;
const SCHNORR_G = 2n;

const ZKP_SCHEME_PSNX_V1 = 'psnx_schnorr_v1';
const ZKP_AUTH_SCHEMA_VERSION = 'v1';
const PSNX_VAULT_KEY_INFO = Buffer.from('eidolon-vault-key-v1', 'utf8');
const PSNX_PUBLIC_FINGERPRINT_INFO = Buffer.from('eidolon-psnx-fingerprint-v1', 'utf8');

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let currentBase = ((base % modulus) + modulus) % modulus;
  let currentExponent = exponent;

  while (currentExponent > 0n) {
    if (currentExponent & 1n) {
      result = (result * currentBase) % modulus;
    }
    currentExponent >>= 1n;
    currentBase = (currentBase * currentBase) % modulus;
  }

  return result;
}

function bigIntToMinimalBuffer(value: bigint): Buffer {
  if (value === 0n) {
    return Buffer.from([0]);
  }

  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  return Buffer.from(hex, 'hex');
}

function randomBigIntBelow(maxExclusive: bigint): bigint {
  if (maxExclusive <= 1n) {
    throw new Error('maxExclusive must be greater than 1');
  }

  const bitLength = maxExclusive.toString(2).length;
  const byteLength = Math.ceil(bitLength / 8);

  while (true) {
    const candidate = BigInt(`0x${randomBytes(byteLength).toString('hex')}`);
    if (candidate < maxExclusive) {
      return candidate;
    }
  }
}

function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

function sha3_256(data: Buffer): string {
  return createHash('sha3-256').update(data).digest('hex');
}

function deriveVaultKey(psnxBytes: Buffer, vaultId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha512', psnxBytes, Buffer.from(vaultId, 'utf8'), PSNX_VAULT_KEY_INFO, 32),
  );
}

function computePsnxFingerprint(psnxBytes: Buffer, vaultId: string): string {
  const material = Buffer.from(
    hkdfSync('sha512', psnxBytes, Buffer.from(vaultId, 'utf8'), PSNX_PUBLIC_FINGERPRINT_INFO, 32),
  );
  return sha3_256(material);
}

function scalarFromVaultKey(vaultKey: Buffer): bigint {
  const derived = sha256(Buffer.concat([Buffer.from('PSNX_ZKP_KEY_', 'utf8'), vaultKey]));
  const scalar = BigInt(`0x${derived.toString('hex')}`) % SCHNORR_Q;
  return scalar === 0n ? 1n : scalar;
}

function createSchnorrProof(vaultKey: Buffer, challengeText: string) {
  const privateScalar = scalarFromVaultKey(vaultKey);
  const publicCommitment = modPow(SCHNORR_G, privateScalar, SCHNORR_P);
  const timestamp = Date.now() / 1000;
  const timestampBuffer = Buffer.allocUnsafe(8);
  timestampBuffer.writeDoubleBE(timestamp, 0);
  const message = Buffer.concat([Buffer.from(challengeText, 'utf8'), timestampBuffer]);

  const nonceScalar = randomBigIntBelow(SCHNORR_Q - 1n) + 1n;
  const ephemeralCommitment = modPow(SCHNORR_G, nonceScalar, SCHNORR_P);
  const challengeHash = sha256(
    Buffer.concat([
      bigIntToMinimalBuffer(ephemeralCommitment),
      bigIntToMinimalBuffer(publicCommitment),
      message,
    ]),
  );
  const challengeScalar = BigInt(`0x${challengeHash.toString('hex')}`) % SCHNORR_Q;
  const responseScalar = (nonceScalar + challengeScalar * privateScalar) % SCHNORR_Q;

  return {
    publicCommitment,
    authData: {
      proof: {
        commitment: `0x${ephemeralCommitment.toString(16)}`,
        challenge: `0x${challengeScalar.toString(16)}`,
        response: `0x${responseScalar.toString(16)}`,
        public_key: `0x${publicCommitment.toString(16)}`,
        message: message.toString('hex'),
        timestamp,
      },
      challenge: challengeText,
      key_fingerprint: sha256(vaultKey).toString('hex').slice(0, 16),
      timestamp,
    },
  };
}

export interface EidolonPsnxEnrollmentPayload {
  vault_id: string;
  public_commitment: string;
  psnx_fingerprint: string;
  zkp_scheme: string;
  zkp_version: string;
  vault_number?: number;
  allow_update: boolean;
}

export async function buildPsnxEnrollmentPayload(
  psnxPath: string,
  vaultId: string,
  vaultNumber?: number,
): Promise<EidolonPsnxEnrollmentPayload> {
  const psnxBytes = await readFile(psnxPath);
  const vaultKey = deriveVaultKey(psnxBytes, vaultId);
  const publicCommitment = modPow(SCHNORR_G, scalarFromVaultKey(vaultKey), SCHNORR_P);

  return {
    vault_id: vaultId,
    public_commitment: `0x${publicCommitment.toString(16)}`,
    psnx_fingerprint: computePsnxFingerprint(psnxBytes, vaultId),
    zkp_scheme: ZKP_SCHEME_PSNX_V1,
    zkp_version: ZKP_AUTH_SCHEMA_VERSION,
    vault_number: typeof vaultNumber === 'number' ? vaultNumber : undefined,
    allow_update: true,
  };
}

export async function buildPsnxLoginProof(
  psnxPath: string,
  vaultId: string,
  nonceHex: string,
): Promise<Record<string, unknown>> {
  const normalizedNonceHex = nonceHex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalizedNonceHex) || normalizedNonceHex.length % 2 !== 0) {
    throw new Error('Invalid PSNX nonce format received from Eidolon.');
  }

  const psnxBytes = await readFile(psnxPath);
  const vaultKey = deriveVaultKey(psnxBytes, vaultId);
  const challengeText = `psnx-auth|${ZKP_AUTH_SCHEMA_VERSION}|${vaultId}|${normalizedNonceHex}`;
  const { publicCommitment, authData } = createSchnorrProof(vaultKey, challengeText);

  return {
    schema_version: ZKP_AUTH_SCHEMA_VERSION,
    scheme: ZKP_SCHEME_PSNX_V1,
    vault_id: vaultId,
    nonce: normalizedNonceHex,
    public_commitment: `0x${publicCommitment.toString(16)}`,
    psnx_fingerprint: computePsnxFingerprint(psnxBytes, vaultId),
    ...authData,
  };
}
