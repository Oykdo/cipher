/**
 * Group conversations — domain validation + DB-layer tests.
 *
 * Two layers:
 *
 *   1. Pure unit tests on the Conversation entity (no DB needed). These
 *      lock in the 2-10 / owner-included / no-duplicates invariants so a
 *      future refactor cannot silently relax them.
 *
 *   2. DB-gated tests behind DATABASE_URL_TEST exercising the new
 *      database.js helpers (createConversation with opts, addMember /
 *      removeMember, markMessagesDeliveredFor dispatcher direct vs
 *      group). Same gating pattern as privacy-invariants.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { Conversation, GROUP_MAX_MEMBERS } from '../domain/entities/Conversation.js';
import { getDatabase } from '../db/database.js';

const describeDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;

// ============================================================================
// Layer 1 — entity validation (pure)
// ============================================================================

describe('Conversation entity — validation', () => {
  it('createDirect produces a 2-participant direct conversation', () => {
    const c = Conversation.createDirect('user-a', 'user-b');
    expect(c.type).toBe('direct');
    expect(c.participants).toHaveLength(2);
    expect(c.createdBy).toBeNull();
    expect(c.isGroup()).toBe(false);
    expect(c.isDirect()).toBe(true);
  });

  it('createDirect refuses two identical participants', () => {
    expect(() => Conversation.createDirect('user-a', 'user-a')).toThrow();
  });

  it('createGroup at the lower bound (2 members) succeeds', () => {
    const c = Conversation.createGroup({
      creatorId: 'owner',
      memberIds: ['owner', 'bob'],
    });
    expect(c.type).toBe('group');
    expect(c.participants).toHaveLength(2);
    expect(c.createdBy).toBe('owner');
    expect(c.isOwner('owner')).toBe(true);
    expect(c.isOwner('bob')).toBe(false);
  });

  it('createGroup at the upper bound (10 members) succeeds', () => {
    const members = Array.from({ length: GROUP_MAX_MEMBERS }, (_, i) => `m${i}`);
    const c = Conversation.createGroup({ creatorId: 'm0', memberIds: members });
    expect(c.participants).toHaveLength(GROUP_MAX_MEMBERS);
  });

  it('createGroup refuses 11 members', () => {
    const members = Array.from({ length: 11 }, (_, i) => `m${i}`);
    expect(() =>
      Conversation.createGroup({ creatorId: 'm0', memberIds: members }),
    ).toThrow(/2 and 10/);
  });

  it('createGroup refuses fewer than 2 members', () => {
    expect(() =>
      Conversation.createGroup({ creatorId: 'lonely', memberIds: ['lonely'] }),
    ).toThrow(/2 and 10/);
  });

  it('createGroup auto-includes the creator if missing from memberIds', () => {
    const c = Conversation.createGroup({
      creatorId: 'owner',
      memberIds: ['bob', 'carol'],
    });
    expect(c.participants).toContain('owner');
    expect(c.participants).toHaveLength(3);
  });

  it('createGroup deduplicates members', () => {
    const c = Conversation.createGroup({
      creatorId: 'owner',
      memberIds: ['owner', 'bob', 'bob'],
    });
    expect(c.participants).toHaveLength(2);
  });

  it('getOtherParticipant throws on a group', () => {
    const c = Conversation.createGroup({
      creatorId: 'owner',
      memberIds: ['owner', 'bob', 'carol'],
    });
    expect(() => c.getOtherParticipant('owner')).toThrow(/direct/);
  });

  it('fromRow restores type / createdBy / encryptedTitle for groups', () => {
    const c = Conversation.fromRow({
      id: 'conv-1',
      type: 'group',
      created_by: 'owner',
      encrypted_title: 'opaque-base64',
      created_at: 1234567890,
      member_ids: ['owner', 'bob', 'carol'],
    });
    expect(c.type).toBe('group');
    expect(c.createdBy).toBe('owner');
    expect(c.encryptedTitle).toBe('opaque-base64');
    expect(c.participants).toHaveLength(3);
  });

  it("fromRow defaults type to 'direct' when missing (legacy rows)", () => {
    const c = Conversation.fromRow({
      id: 'conv-1',
      created_at: 1234567890,
      member_ids: ['user-a', 'user-b'],
    });
    expect(c.type).toBe('direct');
  });
});

// ============================================================================
// Layer 2 — DB layer (gated behind DATABASE_URL_TEST)
// ============================================================================

describeDb('Database — group conversations', () => {
  const db = getDatabase();

  async function seedUser(prefix: string): Promise<string> {
    const id = `${prefix}_${randomUUID()}`.slice(0, 32);
    await db.createUser({
      id,
      username: `${prefix}_${randomUUID().slice(0, 8)}`,
      security_tier: 'standard',
      srp_salt: 'salt',
      srp_verifier: 'verifier',
    });
    return id;
  }

  it('createConversation persists type/createdBy/encryptedTitle for groups', async () => {
    const owner = await seedUser('owner');
    const bob = await seedUser('bob');
    const carol = await seedUser('carol');

    const id = randomUUID();
    await db.createConversation(id, [owner, bob, carol], {
      type: 'group',
      createdBy: owner,
      encryptedTitle: 'enc-title-stub',
    });

    const row = await db.getConversationById(id);
    expect(row.type).toBe('group');
    expect(row.created_by).toBe(owner);
    expect(row.encrypted_title).toBe('enc-title-stub');

    const members = await db.getConversationMembers(id);
    expect(new Set(members)).toEqual(new Set([owner, bob, carol]));
  });

  it('createConversation refuses a group with 11 members', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) ids.push(await seedUser(`m${i}`));
    await expect(
      db.createConversation(randomUUID(), ids, { type: 'group', createdBy: ids[0] }),
    ).rejects.toThrow();
  });

  it('addConversationMember + countConversationMembers', async () => {
    const owner = await seedUser('owner');
    const bob = await seedUser('bob');
    const carol = await seedUser('carol');

    const id = randomUUID();
    await db.createConversation(id, [owner, bob], {
      type: 'group',
      createdBy: owner,
    });

    expect(await db.countConversationMembers(id)).toBe(2);

    const added = await db.addConversationMember(id, carol);
    expect(added).toBe(true);
    expect(await db.countConversationMembers(id)).toBe(3);

    // Idempotent: second add returns false
    const reAdded = await db.addConversationMember(id, carol);
    expect(reAdded).toBe(false);
  });

  it('removeConversationMember works and is idempotent', async () => {
    const owner = await seedUser('owner');
    const bob = await seedUser('bob');
    const carol = await seedUser('carol');

    const id = randomUUID();
    await db.createConversation(id, [owner, bob, carol], {
      type: 'group',
      createdBy: owner,
    });

    const removed = await db.removeConversationMember(id, bob);
    expect(removed).toBe(true);
    expect(await db.countConversationMembers(id)).toBe(2);

    const removedAgain = await db.removeConversationMember(id, bob);
    expect(removedAgain).toBe(false);
  });

  it('markMessagesDeliveredFor on direct: ack via messages.delivered_at', async () => {
    const alice = await seedUser('alice');
    const bob = await seedUser('bob');

    const convId = randomUUID();
    await db.createConversation(convId, [alice, bob], { type: 'direct' });

    const msgId = randomUUID();
    await db.createMessage({
      id: msgId,
      conversation_id: convId,
      sender_id: alice,
      body: '{"version":"test"}',
    });

    const promoted = await db.markMessagesDeliveredFor(convId, bob);
    expect(promoted).toBe(1);

    const row = await db.getMessageById(msgId);
    expect(row.delivered_at).not.toBeNull();
  });

  it('markMessagesDeliveredFor on group: per-recipient + promote when complete', async () => {
    const owner = await seedUser('owner');
    const bob = await seedUser('bob');
    const carol = await seedUser('carol');

    const convId = randomUUID();
    await db.createConversation(convId, [owner, bob, carol], {
      type: 'group',
      createdBy: owner,
    });

    const msgId = randomUUID();
    await db.createMessage({
      id: msgId,
      conversation_id: convId,
      sender_id: owner,
      body: '{"version":"e2ee-v2"}',
    });

    // Bob fetches first → message_deliveries row written, but
    // messages.delivered_at stays NULL because carol hasn't ACKed yet.
    const promotedAfterBob = await db.markMessagesDeliveredFor(convId, bob);
    expect(promotedAfterBob).toBe(0);

    let msgRow = await db.getMessageById(msgId);
    expect(msgRow.delivered_at).toBeNull();

    const bobDelivery = await db.pool.query(
      `SELECT delivered_at FROM message_deliveries
       WHERE message_id = $1 AND user_id = $2`,
      [msgId, bob],
    );
    expect(bobDelivery.rows[0]?.delivered_at).not.toBeNull();

    // Carol fetches → all non-senders ACKed → messages.delivered_at promoted.
    const promotedAfterCarol = await db.markMessagesDeliveredFor(convId, carol);
    expect(promotedAfterCarol).toBe(1);

    msgRow = await db.getMessageById(msgId);
    expect(msgRow.delivered_at).not.toBeNull();
  });

  it('markMessagesDeliveredFor is idempotent on groups', async () => {
    const owner = await seedUser('owner');
    const bob = await seedUser('bob');

    const convId = randomUUID();
    await db.createConversation(convId, [owner, bob], {
      type: 'group',
      createdBy: owner,
    });

    await db.createMessage({
      id: randomUUID(),
      conversation_id: convId,
      sender_id: owner,
      body: '{"version":"e2ee-v2"}',
    });

    const first = await db.markMessagesDeliveredFor(convId, bob);
    expect(first).toBe(1); // bob is the only non-sender → promoted on first ACK

    const second = await db.markMessagesDeliveredFor(convId, bob);
    expect(second).toBe(0); // already promoted, nothing left to do
  });

  it('deleteConversation cascades to members and messages', async () => {
    const owner = await seedUser('owner');
    const bob = await seedUser('bob');

    const convId = randomUUID();
    await db.createConversation(convId, [owner, bob], {
      type: 'group',
      createdBy: owner,
    });
    const msgId = randomUUID();
    await db.createMessage({
      id: msgId,
      conversation_id: convId,
      sender_id: owner,
      body: '{"version":"e2ee-v2"}',
    });

    const deleted = await db.deleteConversation(convId);
    expect(deleted).toBe(true);

    expect(await db.getConversationById(convId)).toBeFalsy();
    expect(await db.countConversationMembers(convId)).toBe(0);
    expect(await db.getMessageById(msgId)).toBeFalsy();
  });
});
