# E2EE Integration Example

This document shows how to integrate E2EE into the existing messaging flow.

## 1. Update Message Sending (Conversations.tsx)

### Before (Legacy Encryption)

```typescript
// Old code in Conversations.tsx
const handleSendMessage = async () => {
  const encrypted = await encryptForConversation(
    messageBody,
    masterKey,
    selectedConvId
  );
  
  const sentMessage = await authFetchV2WithRefresh(`/conversations/${selectedConvId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      body: JSON.stringify(encrypted),
    }),
  });
};
```

### After (E2EE Integration)

```typescript
import { encryptMessageForSending } from '@/lib/e2ee/messagingIntegration';
import { encryptForConversation } from '@/lib/encryption'; // Legacy fallback

const handleSendMessage = async () => {
  // Get recipient username from conversation
  const recipient = conversation.participants.find(p => p.id !== currentUser.id);
  
  // Encrypt with E2EE (with legacy fallback)
  const encryptedBody = await encryptMessageForSending(
    recipient.username,
    messageBody,
    async (text) => encryptForConversation(text, masterKey, selectedConvId)
  );
  
  const sentMessage = await authFetchV2WithRefresh(`/conversations/${selectedConvId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      body: encryptedBody,
    }),
  });
};
```

## 2. Update Message Receiving

### Before (Legacy Decryption)

```typescript
// Old code
const decryptedMessages = await Promise.all(
  messages.map(async (msg) => {
    const decrypted = await decryptFromConversation(
      JSON.parse(msg.body),
      masterKey,
      selectedConvId
    );
    return { ...msg, body: decrypted };
  })
);
```

### After (E2EE Integration)

```typescript
import { decryptReceivedMessage } from '@/lib/e2ee/messagingIntegration';
import { decryptFromConversation } from '@/lib/encryption'; // Legacy fallback

const decryptedMessages = await Promise.all(
  messages.map(async (msg) => {
    // Get sender username
    const sender = conversation.participants.find(p => p.id === msg.senderId);
    
    // Decrypt with E2EE (with legacy fallback)
    const decrypted = await decryptReceivedMessage(
      sender.username,
      msg.body,
      async (encrypted) => decryptFromConversation(encrypted, masterKey, selectedConvId)
    );
    
    return { ...msg, body: decrypted };
  })
);
```

## 3. Add Key Exchange on Conversation Start

### New Function to Add

```typescript
import { getMyKeyBundle, addPeerPublicKey } from '@/lib/e2ee/e2eeService';

/**
 * Exchange E2EE keys when starting a new conversation
 */
const exchangeKeysWithPeer = async (peerUsername: string) => {
  try {
    // Get my key bundle
    const myKeyBundle = await getMyKeyBundle();
    if (!myKeyBundle) {
      console.warn('E2EE not initialized, skipping key exchange');
      return;
    }
    
    // Send my key bundle to server
    await authFetchV2WithRefresh('/api/v2/e2ee/publish-keys', {
      method: 'POST',
      body: JSON.stringify(myKeyBundle),
    });
    
    // Fetch peer's key bundle from server
    const peerKeyBundle = await authFetchV2WithRefresh(
      `/api/v2/e2ee/keys/${peerUsername}`
    );
    
    if (peerKeyBundle) {
      // Store peer's public key
      await addPeerPublicKey(
        peerUsername,
        peerKeyBundle.identityKey,
        peerKeyBundle.fingerprint
      );
      
      console.log(`✅ Keys exchanged with ${peerUsername}`);
    }
  } catch (error) {
    console.error('Key exchange failed:', error);
    // Don't fail the conversation creation, just log the error
  }
};

// Call when creating a new conversation
const handleCreateConversation = async (targetUsername: string) => {
  // Create conversation
  const conversation = await createConversation(targetUsername);
  
  // Exchange keys
  await exchangeKeysWithPeer(targetUsername);
  
  return conversation;
};
```

## 4. Add Encryption Status Indicator

### New Component

```tsx
import { getConversationEncryptionStatus } from '@/lib/e2ee/messagingIntegration';

function EncryptionStatusBadge({ peerUsername }: { peerUsername: string }) {
  const [status, setStatus] = useState<'e2ee' | 'legacy' | 'none'>('none');
  
  useEffect(() => {
    getConversationEncryptionStatus(peerUsername).then(setStatus);
  }, [peerUsername]);
  
  if (status === 'e2ee') {
    return (
      <span className="badge badge-success" title="End-to-End Encrypted">
        🔒 E2EE
      </span>
    );
  }
  
  if (status === 'legacy') {
    return (
      <span className="badge badge-warning" title="Legacy Encryption">
        🔓 Legacy
      </span>
    );
  }
  
  return null;
}

// Use in conversation header
<div className="conversation-header">
  <h2>{conversation.name}</h2>
  <EncryptionStatusBadge peerUsername={peerUsername} />
</div>
```

## 5. Add Key Verification Button

### In Conversation Settings

```tsx
import { KeyVerification } from '@/components/e2ee/KeyVerification';

function ConversationSettings({ conversation }) {
  const [showKeyVerification, setShowKeyVerification] = useState(false);
  const peerUsername = conversation.participants.find(p => p.id !== currentUser.id)?.username;
  
  return (
    <div className="conversation-settings">
      {/* Other settings */}
      
      <button
        onClick={() => setShowKeyVerification(true)}
        className="btn btn-secondary"
      >
        🔑 Verify Encryption Keys
      </button>
      
      {showKeyVerification && (
        <div className="modal">
          <KeyVerification
            peerUsername={peerUsername}
            onVerified={() => {
              alert('Key verified!');
              setShowKeyVerification(false);
            }}
            onClose={() => setShowKeyVerification(false)}
          />
        </div>
      )}
    </div>
  );
}
```

## 6. Server-Side Key Bundle Storage (Backend)

### New Routes to Add (apps/bridge/src/routes/e2ee.ts)

```typescript
import { FastifyInstance } from 'fastify';

export async function e2eeRoutes(fastify: FastifyInstance) {
  /**
   * Publish user's key bundle
   */
  fastify.post('/api/v2/e2ee/publish-keys', async (request, reply) => {
    const userId = request.user.id; // From JWT
    const keyBundle = request.body;
    
    // Store in database
    await fastify.db.storeKeyBundle(userId, keyBundle);
    
    return { success: true };
  });
  
  /**
   * Get user's key bundle by username
   */
  fastify.get('/api/v2/e2ee/keys/:username', async (request, reply) => {
    const { username } = request.params;
    
    // Fetch from database
    const user = await fastify.db.getUserByUsername(username);
    if (!user) {
      reply.code(404);
      return { error: 'User not found' };
    }
    
    const keyBundle = await fastify.db.getKeyBundle(user.id);
    if (!keyBundle) {
      reply.code(404);
      return { error: 'No key bundle found' };
    }
    
    return keyBundle;
  });
}
```

### Database Schema Addition

```sql
-- Add to schema.sql
CREATE TABLE IF NOT EXISTS e2ee_key_bundles (
  user_id TEXT PRIMARY KEY,
  identity_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  signed_prekey_id INTEGER NOT NULL,
  signed_prekey_public TEXT NOT NULL,
  signed_prekey_signature TEXT NOT NULL,
  one_time_prekeys TEXT NOT NULL, -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Summary

The integration involves:

1. ✅ Replace encryption calls with E2EE wrappers
2. ✅ Add key exchange on conversation creation
3. ✅ Add encryption status indicators
4. ✅ Add key verification UI
5. ✅ Add server endpoints for key bundles
6. ✅ Update database schema

All changes are backward compatible with legacy encryption!

