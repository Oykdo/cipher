import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AuthSession } from '../store/auth';
import type { MessageV2 } from '../services/api-v2';
import { useConversationMessages } from './useConversationMessages';
import { encryptForConversation, decryptFromConversation } from '../lib/encryption';
import { resolveMasterKeyForSession } from '../lib/masterKeyResolver';

vi.mock('../lib/encryption', () => ({
  encryptForConversation: vi.fn(async (plaintext: string, masterKey: string, conversationId: string) => ({
    ciphertext: `${masterKey}|${conversationId}|${plaintext}`,
    iv: 'iv',
    tag: 'tag',
  })),
  decryptFromConversation: vi.fn(async (encrypted: any, masterKey: string, conversationId: string) => {
    // Inverse très simple pour les tests
    const prefix = `${masterKey}|${conversationId}|`;
    if (typeof encrypted.ciphertext === 'string' && encrypted.ciphertext.startsWith(prefix)) {
      return encrypted.ciphertext.slice(prefix.length);
    }
    return '[decrypted]';
  }),
}));

vi.mock('../lib/masterKeyResolver', () => ({
  resolveMasterKeyForSession: vi.fn(),
}));

const mockDecrypt = decryptFromConversation as unknown as ReturnType<typeof vi.fn>;
const mockEncrypt = encryptForConversation as unknown as ReturnType<typeof vi.fn>;
const mockResolveMasterKey = resolveMasterKeyForSession as unknown as ReturnType<typeof vi.fn>;

function createSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    user: { id: 'u1', username: 'alice', securityTier: 'standard' },
    accessToken: 'at',
    refreshToken: 'rt',
    ...overrides,
  } as AuthSession;
}

function createMessage(partial: Partial<MessageV2> = {}): MessageV2 {
  return {
    id: partial.id ?? 'm1',
    senderId: partial.senderId ?? 'u1',
    body: partial.body ?? '',
    createdAt: partial.createdAt ?? Date.now(),
    isLocked: partial.isLocked ?? false,
    isBurned: partial.isBurned ?? false,
    scheduledBurnAt: partial.scheduledBurnAt ?? undefined,
    unlockBlockHeight: partial.unlockBlockHeight ?? undefined,
  } as MessageV2;
}

describe('useConversationMessages', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses KeyVault masterKey when available', async () => {
    mockResolveMasterKey.mockResolvedValue('kv-master-key');

    const session = createSession();
    const { result } = renderHook(() => useConversationMessages(session));

    const messages = [
      createMessage({
        id: 'm1',
        body: JSON.stringify({ ciphertext: 'kv-master-key|conv1|hello', iv: 'iv', tag: 'tag' }),
      }),
    ];

    const decrypted = await result.current.decryptMessages('conv1', messages);

    expect(decrypted[0].body).toBe('hello');
  });

  it('falls back to legacy secureKeyAccess when KeyVault is empty', async () => {
    mockResolveMasterKey.mockResolvedValue('legacy-key');

    const session = createSession();
    const { result } = renderHook(() => useConversationMessages(session));

    const messages = [
      createMessage({
        id: 'm1',
        body: JSON.stringify({ ciphertext: 'legacy-key|conv1|hello', iv: 'iv', tag: 'tag' }),
      }),
    ];

    const decrypted = await result.current.decryptMessages('conv1', messages);

    expect(decrypted[0].body).toBe('hello');
  });

  it('returns explicit error body when masterKey cannot be resolved', async () => {
    mockResolveMasterKey.mockResolvedValue(null);

    const session = createSession();
    const { result } = renderHook(() => useConversationMessages(session));

    const messages = [
      createMessage({
        id: 'm1',
        body: JSON.stringify({ ciphertext: 'anything', iv: 'iv', tag: 'tag' }),
      }),
    ];

    const decrypted = await result.current.decryptMessages('conv1', messages);

    expect(decrypted[0].body).toBe('[Erreur: clé de chiffrement manquante]');
  });

  it('encryptMessage uses resolved masterKey', async () => {
    mockResolveMasterKey.mockResolvedValue('kv-master-key');

    const session = createSession();
    const { result } = renderHook(() => useConversationMessages(session));

    const encrypted = await result.current.encryptMessage('conv1', 'hello');

    expect(mockEncrypt).toHaveBeenCalled();
    expect(encrypted.ciphertext).toContain('hello');
  });

  it('decryptIncomingMessage handles locked messages without touching body', async () => {
    const session = createSession();
    mockResolveMasterKey.mockResolvedValue(null);

    const { result } = renderHook(() => useConversationMessages(session));

    const lockedMsg = createMessage({ id: 'm1', isLocked: true, body: 'LOCKED' });

    const plaintext = await result.current.decryptIncomingMessage('conv1', lockedMsg);

    expect(plaintext).toBe('LOCKED');
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('decryptIncomingMessage returns error marker on invalid JSON', async () => {
    mockResolveMasterKey.mockResolvedValue('kv-master-key');

    const session = createSession();
    const { result } = renderHook(() => useConversationMessages(session));

    const badMsg = createMessage({ id: 'm1', body: '{not-json}' });

    const plaintext = await result.current.decryptIncomingMessage('conv1', badMsg);

    expect(plaintext).toBe('[Erreur: JSON invalide]');
  });
});
