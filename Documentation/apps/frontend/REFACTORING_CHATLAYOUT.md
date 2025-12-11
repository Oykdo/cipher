# ChatLayout.tsx Refactoring Guide

## Current Status
**File Size:** 1174 lines  
**Lint Limit:** 300 lines  
**Reduction Needed:** ~870 lines (74% reduction)  
**ConversationPanel Complexity:** 30 (target: ≤15)

## Components to Extract

### 1. MessageBubble.tsx (~200 lines)
**Location:** Lines 877-1077  
**Complexity:** High (decryption, time-lock, burn-after-reading)

**Responsibilities:**
- Message decryption (multiple formats)
- Time-lock display and countdown
- Burn-after-reading countdown
- Copy to clipboard
- Error handling

**Extract to:** `src/components/chat/MessageBubble.tsx`

**Dependencies:**
- `useAuthStore`, `useBlockHeight`
- `decrypt`, `decryptSealed`, `decryptWithPadding`
- `api.ackMessage`

**Sub-components to create:**
- `TimeLockIndicator.tsx` - Display time-lock status
- `BurnCountdown.tsx` - Display burn countdown
- `MessageActions.tsx` - Copy button, etc.

---

### 2. ConversationPanel.tsx (~330 lines)
**Location:** Lines 438-768  
**Complexity:** 30 (highest in codebase)

**Responsibilities:**
- Message list rendering
- Message sending with encryption
- Time-lock picker
- Burn-after-reading picker
- Pending messages handling
- Attachment button
- Offline queue

**Extract to:** `src/components/chat/ConversationPanel.tsx`

**Sub-components to create:**
- `ConversationHeader.tsx` (header with avatar, E2E status)
- `MessageInputArea.tsx` (footer with input, buttons, pickers)
- `PendingMessagesBanner.tsx` (pending messages notification)
- `ConversationEmpty.tsx` (empty state)

**Refactoring to reduce complexity:**
```typescript
// Split into smaller functions:
- useMessageSending() - Hook for send logic
- useMessageRetry() - Hook for offline retry
- useConversationKey() - Hook for crypto key derivation
- useMessageScroll() - Hook for infinite scroll
```

---

### 3. Sidebar.tsx (~160 lines)
**Location:** Lines 276-437  
**Complexity:** Medium

**Responsibilities:**
- Conversation list
- Search users
- Create conversation

**Extract to:** `src/components/chat/Sidebar.tsx`

**Sub-components to create:**
- `ConversationListItem.tsx` - Single conversation row
- `UserSearchModal.tsx` - User search dialog
- `ConversationList.tsx` - Virtualized list

---

### 4. MessageList.tsx (~40 lines)
**Location:** Lines 239-276  
**Complexity:** Low (already uses virtualization)

**Extract to:** `src/components/chat/MessageList.tsx`

**Notes:**
- Already using @tanstack/react-virtual
- Minimal refactoring needed
- Just extract as-is

---

### 5. AttachButton.tsx (~100 lines)
**Location:** Lines 771-863  
**Complexity:** High (chunked upload)

**Responsibilities:**
- File picker
- File encryption
- Chunked upload to server
- Progress tracking

**Extract to:** `src/components/chat/AttachButton.tsx`

**Sub-components:**
- `UploadProgressModal.tsx` - Show upload progress

---

### 6. Utility Components

**MessageContent.tsx** (Lines 1078-1092)
- Parse and render message content
- Handle attachments

**AttachmentMessage.tsx** (Lines 1113-1174)
- Download and decrypt attachment
- Display file info

**CloseIcon.tsx** (Lines 1094-1112)
- Simple SVG icon

**Utils:**
```typescript
// src/utils/base64.ts
export function bytesToBase64(bytes: Uint8Array): string;
export function base64ToBytes(b64: string): Uint8Array;
```

---

## Refactoring Steps

### Phase 1: Extract Simple Components (2-3h)
1. Create `src/components/chat/` directory ✅
2. Extract `MessageList.tsx` (low complexity)
3. Extract `CloseIcon.tsx` and utils
4. Extract `MessageContent.tsx` and `AttachmentMessage.tsx`
5. Update `ChatLayout.tsx` imports

**Expected Reduction:** ~200 lines  
**Result:** ChatLayout.tsx → ~970 lines

---

### Phase 2: Extract Complex Components (4-6h)
1. Extract `MessageBubble.tsx` with sub-components
   - Create `TimeLockIndicator.tsx`
   - Create `BurnCountdown.tsx`
   - Create `MessageActions.tsx`
2. Extract `AttachButton.tsx` with `UploadProgressModal.tsx`
3. Update tests if any

**Expected Reduction:** ~300 lines  
**Result:** ChatLayout.tsx → ~670 lines

---

### Phase 3: Split ConversationPanel (6-8h)
1. Extract custom hooks:
   ```typescript
   // src/hooks/chat/useMessageSending.ts
   // src/hooks/chat/useMessageRetry.ts
   // src/hooks/chat/useConversationKey.ts
   // src/hooks/chat/useMessageScroll.ts
   ```
2. Extract sub-components:
   - `ConversationHeader.tsx`
   - `MessageInputArea.tsx`
   - `PendingMessagesBanner.tsx`
3. Create final `ConversationPanel.tsx` (orchestrator)

**Expected Reduction:** ~330 lines  
**Complexity Reduction:** 30 → ~12 (below limit!)  
**Result:** ChatLayout.tsx → ~340 lines

---

### Phase 4: Extract Sidebar (2-3h)
1. Extract `ConversationListItem.tsx`
2. Extract `UserSearchModal.tsx`
3. Extract `ConversationList.tsx`
4. Create final `Sidebar.tsx` (orchestrator)

**Expected Reduction:** ~160 lines  
**Result:** ChatLayout.tsx → **~180 lines** ✅

---

## Final Structure

```
src/
├── screens/
│   └── ChatLayout.tsx (~180 lines) ← Orchestrator only
├── components/
│   ├── chat/
│   │   ├── ConversationPanel.tsx (~100 lines)
│   │   ├── ConversationHeader.tsx (~30 lines)
│   │   ├── MessageInputArea.tsx (~80 lines)
│   │   ├── MessageList.tsx (~40 lines)
│   │   ├── MessageBubble.tsx (~120 lines)
│   │   ├── TimeLockIndicator.tsx (~20 lines)
│   │   ├── BurnCountdown.tsx (~25 lines)
│   │   ├── MessageActions.tsx (~15 lines)
│   │   ├── MessageContent.tsx (~20 lines)
│   │   ├── AttachmentMessage.tsx (~60 lines)
│   │   ├── AttachButton.tsx (~70 lines)
│   │   ├── UploadProgressModal.tsx (~40 lines)
│   │   ├── Sidebar.tsx (~80 lines)
│   │   ├── ConversationListItem.tsx (~40 lines)
│   │   ├── UserSearchModal.tsx (~50 lines)
│   │   ├── ConversationList.tsx (~30 lines)
│   │   ├── PendingMessagesBanner.tsx (~25 lines)
│   │   └── CloseIcon.tsx (~15 lines)
│   └── ...
├── hooks/
│   └── chat/
│       ├── useMessageSending.ts (~60 lines)
│       ├── useMessageRetry.ts (~40 lines)
│       ├── useConversationKey.ts (~30 lines)
│       └── useMessageScroll.ts (~50 lines)
└── utils/
    └── base64.ts (~10 lines)
```

**Total:** 1174 lines → Same logic, better structure  
**ChatLayout.tsx:** 1174 → 180 lines (**-994 lines, -84%**) ✅  
**ConversationPanel complexity:** 30 → 12 (**-60%**) ✅

---

## Benefits

1. **Maintainability:** Each component < 120 lines
2. **Testability:** Components can be unit tested independently
3. **Reusability:** Components can be reused in other screens
4. **Performance:** React.memo on leaf components reduces re-renders
5. **Type Safety:** Clear interfaces between components
6. **Complexity:** No function > complexity 15

---

## Testing Strategy

After each extraction:
1. Run `npm run dev` - Verify UI works
2. Test message sending/receiving
3. Test time-lock and burn-after-reading
4. Test attachment upload/download
5. Test offline mode and retry
6. Run lint: `npm run lint`

---

## Priority

**High Priority** (affects lint errors):
- Phase 1 & 2: Reduce file size below 600 lines

**Medium Priority** (complexity):
- Phase 3: Reduce ConversationPanel complexity below 15

**Low Priority** (nice to have):
- Phase 4: Extract Sidebar for cleaner architecture

---

## Estimated Total Time
**15-20 hours** for complete refactoring  
**Can be done incrementally** (commit after each phase)
