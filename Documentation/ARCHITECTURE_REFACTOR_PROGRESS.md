# Architecture Refactoring Progress

**Date**: 2 Novembre 2025  
**Status**: Phase 1 - 85% Complete  
**Next Session**: Fix remaining TypeScript errors + Test server startup

---

## ✅ Completed (85%)

### 1. Domain Layer - ✅ 100% COMPLETE
- **Entities**: User, Conversation, Message (with extended properties)
- **Value Objects**: SecurityTier
- **Repository Interfaces**: IUserRepository, IConversationRepository, IMessageRepository
- **Custom Errors**: BaseError, UserErrors, ConversationErrors, MessageErrors, AuthErrors

**Files Created**:
- `src/domain/entities/` (3 files)
- `src/domain/value-objects/` (1 file)
- `src/domain/repositories/` (3 files)
- `src/domain/errors/` (6 files)

### 2. Application Layer - ✅ 100% COMPLETE
- **Use Cases**: LoginUseCase, SignupUseCase, CreateConversationUseCase, ListConversationsUseCase, SendMessageUseCase, AcknowledgeMessageUseCase
- **Services**: AuthService

**Files Created**:
- `src/application/use-cases/auth/` (2 files)
- `src/application/use-cases/conversation/` (2 files)
- `src/application/use-cases/message/` (4 files)
- `src/application/services/AuthService.ts`

### 3. Infrastructure Layer - ✅ 95% COMPLETE
- **Repositories**: UserRepository, ConversationRepository, MessageRepository
- **Services**: JWTService (needs minor fixes)
- **DI Container**: Manual container for dependency injection

**Files Created**:
- `src/infrastructure/database/repositories/` (3 files + index)
- `src/infrastructure/services/JWTService.ts`
- `src/infrastructure/container/DIContainer.ts`

### 4. Presentation Layer - ✅ 100% COMPLETE
- **Controllers**: AuthController, ConversationController, MessageController
- **DTOs**: auth.dto.ts, conversation.dto.ts, message.dto.ts (with Zod validation)
- **Routes**: Modular routes for auth, conversation, message
- **app-new.ts**: New architecture entry point (runs on `/api/v2/`)

**Files Created**:
- `src/presentation/http/controllers/` (3 files)
- `src/presentation/http/dtos/` (3 files)
- `src/presentation/http/routes/` (4 files)
- `src/app-new.ts`

### 5. Package Updates
- ✅ Installed `zod` for validation
- ✅ Added `dev:new` and `start:new` npm scripts

---

## ⚠️ Remaining Issues (15%)

### TypeScript Compilation Errors (10 errors)

#### 1. **createRateLimiter Signature Mismatch**
**Files affected**: All route files  
**Error**: `Expected 1 arguments, but got 2`  
**Fix needed**: Check `createRateLimiter` function signature and update route calls

```typescript
// Current (incorrect):
onRequest: [createRateLimiter(5, 60)]

// Need to verify correct signature in middleware/rateLimiter.ts
```

#### 2. **JWT Service Type Issues**
**File**: `src/infrastructure/services/JWTService.ts`  
**Errors**:
- Line 25: `app.jwt.sign()` payload type mismatch (expects `{sub, tier}`, receives `{id}`)
- Line 32: `createRefreshToken` argument type mismatch
- Line 52, 63: Argument count mismatch

**Fix needed**: 
- Update JWT payload to match Fastify JWT type expectations
- Update `createRefreshToken` and `validateRefreshToken` function calls

#### 3. **Old Use Cases Using Old Interface Methods**
**Files**: 
- `BurnMessagesUseCase.ts` (uses `findMessagesToBurn`, `deleteBurnedMessages`)
- `UnlockTimeLockedMessagesUseCase.ts` (uses `findLockedMessages`)

**Fix needed**: These use cases aren't used by the new architecture yet, can be fixed later or excluded from build

#### 4. **DI Container Type Error**
**File**: `src/infrastructure/container/DIContainer.ts`  
**Error**: Line 87 - `UserRepository` assigned where `IMessageRepository` expected

**Fix needed**: Verify the constructor parameters are in correct order

---

## 🧪 Testing Plan (Not Started)

### Phase 1: Compilation
- [ ] Fix remaining TypeScript errors
- [ ] Verify `npm run build` succeeds
- [ ] Verify no type errors in IDE

### Phase 2: Server Startup
- [ ] Run `npm run dev:new`
- [ ] Verify server starts on port 4000
- [ ] Verify `/health-v2` endpoint responds
- [ ] Check logs for DI container initialization

### Phase 3: Endpoint Testing
- [ ] Test `POST /api/v2/auth/signup` (create user)
- [ ] Test `POST /api/v2/auth/login` (authenticate)
- [ ] Test `GET /api/v2/conversations` (list conversations)
- [ ] Test `POST /api/v2/conversations` (create conversation)
- [ ] Test `POST /api/v2/conversations/:id/messages` (send message)

### Phase 4: Integration Testing
- [ ] Test full user flow (signup → login → create conversation → send message)
- [ ] Test error handling (invalid input, missing auth, etc.)
- [ ] Test rate limiting
- [ ] Test CSP headers with nonces

---

## 📊 Architecture Comparison

### Before (Monolith)
```
index.ts (1163 lines)
├── All routes defined inline
├── Business logic mixed with HTTP
├── Database queries in routes
├── No separation of concerns
└── Impossible to test in isolation
```

### After (Clean Architecture)
```
app-new.ts (175 lines)
├── Domain Layer (12 files)
│   ├── Entities, Value Objects
│   ├── Repository Interfaces
│   └── Custom Errors
├── Application Layer (9 files)
│   ├── Use Cases (business logic)
│   └── Services
├── Infrastructure Layer (5 files)
│   ├── Repository Implementations
│   ├── External Services (JWT, etc.)
│   └── DI Container
└── Presentation Layer (10 files)
    ├── Controllers
    ├── DTOs (with Zod validation)
    └── Routes (modular)
```

**Benefits**:
- ✅ Testable (each layer can be tested independently)
- ✅ Maintainable (clear separation of concerns)
- ✅ Scalable (easy to add new features)
- ✅ Type-safe (DTOs with Zod validation)
- ✅ Documented (interfaces define contracts)

---

## 🎯 Next Steps

### Immediate (This Session or Next)
1. **Fix TypeScript Errors** (30-60 min)
   - Check `createRateLimiter` signature
   - Fix JWT Service types
   - Fix DI Container parameter order
   - Exclude unused use cases from build (or fix them)

2. **Test Server Startup** (15 min)
   - Run `npm run dev:new`
   - Verify no runtime errors
   - Test `/health-v2` endpoint

3. **Basic Endpoint Testing** (30 min)
   - Test signup/login flow
   - Test create conversation
   - Test send message

### Short Term (Next Session)
4. **Complete Missing Use Cases** (1-2 hours)
   - RefreshTokenUseCase
   - LogoutUseCase
   - GetMessagesUseCase
   - GetConversationUseCase

5. **WebSocket Migration** (2-3 hours)
   - Move WebSocket logic to new architecture
   - Create WebSocket handlers
   - Integrate with use cases

### Medium Term (Week 2)
6. **Phase 2: Testing Infrastructure** (3-5 days)
   - Setup Vitest
   - Write unit tests for use cases
   - Write integration tests for API
   - Achieve 80% coverage

7. **Phase 3: Error Handling & Logging** (2-3 days)
   - Enhance error handling
   - Structured logging with Pino
   - Error tracking integration

---

## 📝 Notes

### Cohabitation Strategy
The new architecture runs on `/api/v2/*` while the old `index.ts` remains on `/api/*`. This allows:
- Gradual migration
- A/B testing
- Rollback capability
- Zero downtime deployment

### Package Scripts
```bash
# Old architecture (existing)
npm run dev        # tsx watch src/index.ts
npm start          # node dist/index.js

# New architecture (added)
npm run dev:new    # tsx watch src/app-new.ts
npm start:new      # node dist/app-new.js
```

### Key Architectural Decisions
1. **Manual DI Container**: Simple, explicit, no magic. Can migrate to TSyringe/Awilix later.
2. **Zod for Validation**: Type-safe DTOs with runtime validation.
3. **Fastify Native JWT**: Using `app.jwt.sign()` instead of external library.
4. **Repository Pattern**: Clean abstraction over database access.
5. **Use Case Pattern**: Single responsibility, testable business logic.

---

## 🚀 Deployment Strategy

### Phase 1: Parallel Deployment
- Deploy both architectures
- Route traffic based on API version (`/api/v1` vs `/api/v2`)
- Monitor metrics for both

### Phase 2: Gradual Migration
- Migrate features one by one to v2
- Deprecate v1 endpoints gradually
- Keep backward compatibility where needed

### Phase 3: Full Migration
- Remove old `index.ts` monolith
- Rename `app-new.ts` to `index.ts`
- Update all routes to `/api/*` (remove `/v2`)

---

**End of Progress Report**
