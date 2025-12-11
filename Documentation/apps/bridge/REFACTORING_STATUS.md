# Backend Refactoring Status - Phase 2

## ✅ Completed

### 1. Routes Extracted (3 modules created)

- **`src/routes/auth.ts`** (236 lines)
  - POST `/api/v2/auth/signup` (Standard & DiceKey)
  - POST `/api/v2/auth/login`
  - POST `/auth/refresh`
  - POST `/auth/logout`
  - POST `/auth/logout-all`

- **`src/routes/conversations.ts`** (122 lines)
  - GET `/conversations` (list user conversations)
  - POST `/conversations` (create conversation)
  - GET `/users/search` (search users)

- **`src/routes/messages.ts`** (164 lines)
  - GET `/conversations/:id/messages` (paginated, with time-lock)
  - POST `/messages` (send message with optional time-lock)

**Total extracted: 522 lines from index.ts**

## 🔄 Next Steps to Complete Refactoring

### Step 1: Add Fastify Decorators in index.ts

Add these after line 297 (after `app.decorate('authenticate', ...)`):

```typescript
// Decorate Fastify with limiters
app.decorate('signupLimiter', signupLimiter);
app.decorate('loginLimiter', loginLimiter);
app.decorate('messageLimiter', messageLimiter);

// Decorate Fastify with utility functions
app.decorate('registerConversation', registerConversation);
app.decorate('broadcast', broadcast);
```

### Step 2: Import and Register Routes

Add these imports after line 18:

```typescript
import { authRoutes } from './routes/auth.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';
```

Add these registrations after plugins setup (around line 290):

```typescript
// Register modular routes
await app.register(authRoutes);
await app.register(conversationRoutes);
await app.register(messageRoutes);
```

### Step 3: Remove Duplicated Routes from index.ts

Delete these line ranges (backup first!):

- **Auth routes** (lines 592-810): DELETE entire section
- **Conversations & Users** (lines 811-890): DELETE entire section  
- **Messages** (lines 890-1035): DELETE specific routes only, keep attachments

### Step 4: Add Type Declarations

Create `src/types/fastify.d.ts`:

```typescript
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    signupLimiter: any;
    loginLimiter: any;
    messageLimiter: any;
    registerConversation: (memberA: string, memberB: string) => any;
    broadcast: (userIds: string[], payload: unknown) => void;
  }
}
```

## 📊 Expected Results After Refactoring

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `src/index.ts` | 1665 lines | ~1100 lines | **-565 lines** ✅ |
| `src/routes/auth.ts` | - | 236 lines | New |
| `src/routes/conversations.ts` | - | 122 lines | New |
| `src/routes/messages.ts` | - | 164 lines | New |

**Total codebase:** Same logic, better structure, **-43 lines** (overhead reduced by modularization)

## 🚀 Benefits

1. **Separation of Concerns**: Each route file handles one domain
2. **Easier Testing**: Routes can be tested independently
3. **Better Maintainability**: Smaller files, clearer responsibilities
4. **Type Safety**: Dedicated interfaces per module
5. **Scalability**: Easy to add new route modules

## ⚠️ Important Notes

- **DO NOT delete backup/attachments/blockchain routes yet** - they can be extracted in Phase 3
- **Test after each change**: `npm test` in `apps/bridge`
- **Keep index.ts under 300 lines** - extract more routes if needed

## 📝 Future Refactoring (Phase 3)

Additional routes to extract:

- `src/routes/attachments.ts` (~280 lines) - File upload/download logic
- `src/routes/backup.ts` (~240 lines) - Database backup/restore
- `src/routes/blockchain.ts` (~120 lines) - Blockchain info endpoints
- `src/routes/health.ts` (~80 lines) - Health checks, CSP, audit
- `src/websocket/handler.ts` (~120 lines) - WebSocket connection logic

**Target:** `index.ts` < 200 lines (orchestration only)
