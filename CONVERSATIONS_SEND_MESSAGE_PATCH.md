# Patch pour Conversations.tsx - sendMessage avec e2ee-v2

## Instructions d'intégration

Remplacer la partie encryption dans `sendMessage()` (lignes ~640-680) par ce nouveau code :

```typescript
// ENCRYPTION: Try e2ee-v2 first, fallback to e2ee-v1
let encryptedBody: string;

if (encryptedAttachment) {
  // For attachments, encrypt the attachment envelope
  const attachmentJson = JSON.stringify(encryptedAttachment);
  
  if (useE2EEv2 && peerUsername) {
    // Use e2ee-v2 for attachments
    console.log('🔐 [E2EE-v2] Encrypting attachment with e2ee-v2');
    try {
      const userKeys = await loadUserKeys(session.user.id);
      if (!userKeys) throw new Error('Failed to load user keys');
      
      const participantKeys = await getConversationParticipantKeys(selectedConvId);
      
      const encrypted = await encryptSelfEncryptingMessage(
        attachmentJson,
        participantKeys.map(p => ({ userId: p.userId, publicKey: p.publicKey })),
        'attachment',
        {
          filename: attachmentFile!.name,
          mimeType: attachmentFile!.type,
          size: attachmentFile!.size,
        }
      );
      
      encryptedBody = JSON.stringify(encrypted);
      console.log('✅ [E2EE-v2] Attachment encrypted with e2ee-v2');
    } catch (e2eev2Error) {
      console.warn('⚠️ [E2EE-v2] Failed, falling back to e2ee-v1:', e2eev2Error);
      // Fallback to e2ee-v1
      if (peerUsername) {
        encryptedBody = await encryptMessageForSending(
          peerUsername,
          attachmentJson,
          async (text) => await encryptMessage(selectedConvId, text)
        );
      } else {
        const encrypted = await encryptMessage(selectedConvId, attachmentJson);
        encryptedBody = JSON.stringify(encrypted);
      }
    }
  } else if (peerUsername) {
    // e2ee-v1 fallback
    encryptedBody = await encryptMessageForSending(
      peerUsername,
      attachmentJson,
      async (text) => await encryptMessage(selectedConvId, text)
    );
  } else {
    // Legacy encryption
    console.warn('⚠️ [E2EE] No peer username for attachment, using legacy encryption');
    const encrypted = await encryptMessage(selectedConvId, attachmentJson);
    encryptedBody = JSON.stringify(encrypted);
  }
} else if (useE2EEv2 && peerUsername) {
  // TEXT MESSAGE with e2ee-v2
  console.log('🔐 [E2EE-v2] Encrypting text message with e2ee-v2');
  
  try {
    // Load user's own keys
    const userKeys = await loadUserKeys(session.user.id);
    if (!userKeys) {
      throw new Error('User keys not found');
    }
    
    // Fetch participant keys (including sender!)
    const participantKeys = await getConversationParticipantKeys(selectedConvId);
    
    console.log(`📋 [E2EE-v2] Encrypting for ${participantKeys.length} participants`);
    
    // Determine message type
    let messageType: 'standard' | 'bar' | 'timelock' = 'standard';
    if (burnAfterReading) {
      messageType = 'bar';
    } else if (timeLockEnabled) {
      messageType = 'timelock';
    }
    
    // Encrypt with e2ee-v2
    const encrypted = await encryptSelfEncryptingMessage(
      plaintextBody,
      participantKeys.map(p => ({
        userId: p.userId,
        publicKey: p.publicKey,
      })),
      messageType
    );
    
    encryptedBody = JSON.stringify(encrypted);
    console.log('✅ [E2EE-v2] Message encrypted successfully');
  } catch (e2eev2Error) {
    console.warn('⚠️ [E2EE-v2] Encryption failed, falling back to e2ee-v1:', e2eev2Error);
    
    // Fallback to e2ee-v1
    encryptedBody = await encryptMessageForSending(
      peerUsername,
      plaintextBody,
      async (text) => await encryptMessage(selectedConvId, text)
    );
  }
} else if (peerUsername) {
  // e2ee-v1 fallback (no e2ee-v2 keys)
  console.log('🔐 [E2EE-v1] Using e2ee-v1 encryption');
  encryptedBody = await encryptMessageForSending(
    peerUsername,
    plaintextBody,
    async (text) => await encryptMessage(selectedConvId, text)
  );
} else {
  // Legacy encryption (no username)
  console.warn('⚠️ [E2EE] No peer username, using legacy encryption');
  const encrypted = await encryptMessage(selectedConvId, plaintextBody);
  encryptedBody = JSON.stringify(encrypted);
}
```

## Localisation dans le fichier

Recherchez dans `Conversations.tsx` :
```typescript
// Fallback to server relay (also required for burn/time-lock features and attachments)
updateConnectionMode(selectedConvId, 'relayed');

let encryptedBody: string;

if (encryptedAttachment) {
```

Et remplacez tout le bloc `if (encryptedAttachment) { ... } else if (peerUsername) { ... }` par le code ci-dessus.

## Test après modification

1. Rechargez l'application
2. Ouvrez DevTools console
3. Envoyez un message
4. Vous devriez voir :
   ```
   ✅ [Conversations] e2ee-v2 keys detected, will use new format for messages
   🔐 [E2EE-v2] Encrypting text message with e2ee-v2
   📋 [E2EE-v2] Encrypting for 2 participants
   ✅ [E2EE-v2] Message encrypted successfully
   ```
