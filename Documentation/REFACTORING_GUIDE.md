# 🏗️ Guide de Refactoring - index.ts → Clean Architecture

**Date:** 9 Novembre 2025  
**Objectif:** Transformer le monolithe `index.ts` (1665 lignes) en architecture Clean Architecture  
**Durée Estimée:** 5-7 jours  

---

## 📊 État Actuel

```
apps/bridge/src/index.ts
├─ 1665 lignes (🔴 CRITIQUE)
├─ 40+ routes inline
├─ Business logic mélangée
├─ Complexité cyclomatique: ~30
└─ Tests impossibles (couplage fort)
```

---

## 🎯 Architecture Cible

```
apps/bridge/src/
├── application/
│   ├── use-cases/
│   │   ├── auth/
│   │   │   ├── SignupUseCase.ts          (✅ Existe)
│   │   │   ├── LoginUseCase.ts           (✅ Existe)
│   │   │   └── RefreshTokenUseCase.ts    (TODO)
│   │   ├── conversation/
│   │   │   ├── CreateConversationUseCase.ts
│   │   │   ├── ListConversationsUseCase.ts
│   │   │   └── SearchUsersUseCase.ts
│   │   └── message/
│   │       ├── SendMessageUseCase.ts
│   │       ├── GetMessagesUseCase.ts
│   │       ├── BurnMessagesUseCase.ts
│   │       └── UnlockTimeLockedMessagesUseCase.ts
│   └── services/
│       └── AuthService.ts                (✅ Existe)
│
├── domain/
│   ├── entities/
│   │   ├── User.ts                       (✅ Existe)
│   │   ├── Conversation.ts               (✅ Existe)
│   │   └── Message.ts                    (✅ Existe)
│   ├── repositories/                     (Interfaces)
│   │   ├── IUserRepository.ts
│   │   ├── IConversationRepository.ts
│   │   └── IMessageRepository.ts
│   └── errors/
│       ├── AuthErrors.ts                 (✅ Existe)
│       ├── ConversationErrors.ts
│       └── MessageErrors.ts
│
├── infrastructure/
│   ├── database/
│   │   └── repositories/
│   │       ├── UserRepository.ts         (Implémentation SQLite)
│   │       ├── ConversationRepository.ts
│   │       └── MessageRepository.ts
│   └── websocket/
│       └── WebSocketManager.ts           (TODO)
│
├── presentation/
│   ├── http/
│   │   ├── routes/
│   │   │   ├── auth.routes.ts            (✅ Existe)
│   │   │   ├── conversation.routes.ts    (✅ Existe)
│   │   │   └── message.routes.ts         (✅ Existe)
│   │   ├── controllers/
│   │   │   ├── AuthController.ts
│   │   │   ├── ConversationController.ts
│   │   │   └── MessageController.ts
│   │   └── dtos/
│   │       ├── auth.dto.ts
│   │       ├── conversation.dto.ts
│   │       └── message.dto.ts
│   └── websocket/
│       └── handlers/
│           └── MessageHandler.ts
│
├── middleware/
│   ├── authenticate.ts                   (TODO - extraire de index.ts)
│   ├── proofOfWork.ts                    (✅ Existe)
│   ├── rateLimiter.ts                    (✅ Existe)
│   └── reputationSystem.ts               (✅ Existe)
│
├── utils/
│   ├── refreshToken.ts                   (✅ Existe)
│   └── httpsEnforcement.ts               (✅ Existe)
│
└── app.ts                                (NEW - Remplace index.ts)
    ├─ Configuration Fastify (~50 lignes)
    ├─ Register plugins (~30 lignes)
    ├─ Register routes (~20 lignes)
    ├─ Error handlers (~30 lignes)
    ├─ WebSocket setup (~40 lignes)
    └─ Export app builder (~30 lignes)
    = ~200 lignes TOTAL ✅
```

---

## 📝 Plan de Refactoring (7 Jours)

### Jour 1: Setup & Middleware

#### 1.1 Extraire Middleware Authenticate

**Fichier:** `src/middleware/authenticate.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      username: string;
    };
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Verify JWT token
    const payload = (await request.jwtVerify()) as JWTPayload & { sub: string };
    
    // Attach user to request
    request.user = {
      id: payload.sub,
      username: payload.username || '',
    };
  } catch (error) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
```

**Migration depuis index.ts:**
```typescript
// AVANT (dans index.ts, ligne ~80)
async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (error) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

// APRÈS (import)
import { authenticate } from './middleware/authenticate.js';
```

---

#### 1.2 Extraire WebSocket Manager

**Fichier:** `src/infrastructure/websocket/WebSocketManager.ts`

```typescript
import type { WebSocket } from '@fastify/websocket';

export class WebSocketManager {
  // Map: conversationKey → Set<WebSocket>
  private activeConversations = new Map<string, Set<WebSocket>>();
  
  // Map: userId → Set<WebSocket>
  private userSockets = new Map<string, Set<WebSocket>>();

  /**
   * Generate conversation key (sorted member IDs)
   */
  private getConversationKey(memberIds: string[]): string {
    return JSON.stringify([...memberIds].sort());
  }

  /**
   * Register WebSocket for conversation
   */
  registerConversation(conversationId: string, memberIds: string[], socket: WebSocket) {
    const key = this.getConversationKey(memberIds);
    
    if (!this.activeConversations.has(key)) {
      this.activeConversations.set(key, new Set());
    }
    
    this.activeConversations.get(key)!.add(socket);
  }

  /**
   * Register WebSocket for user
   */
  registerUser(userId: string, socket: WebSocket) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    
    this.userSockets.get(userId)!.add(socket);
  }

  /**
   * Unregister WebSocket
   */
  unregister(socket: WebSocket) {
    // Remove from conversations
    for (const sockets of this.activeConversations.values()) {
      sockets.delete(socket);
    }
    
    // Remove from users
    for (const sockets of this.userSockets.values()) {
      sockets.delete(socket);
    }
  }

  /**
   * Broadcast message to conversation
   */
  broadcastToConversation(memberIds: string[], message: unknown) {
    const key = this.getConversationKey(memberIds);
    const sockets = this.activeConversations.get(key) || new Set();
    
    const payload = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState === 1) { // OPEN
        socket.send(payload);
      }
    }
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, message: unknown) {
    const sockets = this.userSockets.get(userId) || new Set();
    const payload = JSON.stringify(message);
    
    for (const socket of sockets) {
      if (socket.readyState === 1) {
        socket.send(payload);
      }
    }
  }

  /**
   * Get active connection count
   */
  getStats() {
    let totalSockets = 0;
    for (const sockets of this.activeConversations.values()) {
      totalSockets += sockets.size;
    }
    
    return {
      conversations: this.activeConversations.size,
      users: this.userSockets.size,
      totalConnections: totalSockets,
    };
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
```

**Migration depuis index.ts:**
```typescript
// AVANT (ligne ~100-120)
const activeConversations = new Map<string, Set<WebSocket>>();

// Dans route /ws
const convKey = JSON.stringify([userId1, userId2].sort());
const sockets = activeConversations.get(convKey) || new Set();
// ...

// APRÈS
import { wsManager } from './infrastructure/websocket/WebSocketManager.js';

wsManager.broadcastToConversation([userId1, userId2], { type: 'message', data: message });
```

---

### Jour 2-3: Refactorer Routes Auth

#### 2.1 Controller Auth

**Fichier:** `src/presentation/http/controllers/AuthController.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { SignupUseCase } from '../../../application/use-cases/auth/SignupUseCase.js';
import { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase.js';
import { getDatabase } from '../../../db/database.js';
import { SignupDto, LoginDto } from '../dtos/auth.dto.js';

export class AuthController {
  private signupUseCase: SignupUseCase;
  private loginUseCase: LoginUseCase;

  constructor() {
    const db = getDatabase();
    this.signupUseCase = new SignupUseCase(db);
    this.loginUseCase = new LoginUseCase(db);
  }

  async signup(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Validate DTO
      const dto = SignupDto.parse(request.body);
      
      // Execute use case
      const result = await this.signupUseCase.execute(dto);
      
      // Generate JWT
      const accessToken = await reply.jwtSign(
        { sub: result.userId, username: result.username },
        { expiresIn: '1h' }
      );
      
      return reply.code(200).send({
        user: {
          id: result.userId,
          username: result.username,
          securityTier: result.securityTier,
        },
        accessToken,
      });
    } catch (error) {
      if (error instanceof Error) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const dto = LoginDto.parse(request.body);
      const result = await this.loginUseCase.execute(dto);
      
      const accessToken = await reply.jwtSign(
        { sub: result.userId, username: result.username },
        { expiresIn: '1h' }
      );
      
      return reply.code(200).send({
        user: {
          id: result.userId,
          username: result.username,
          securityTier: result.securityTier,
        },
        accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (error) {
      if (error instanceof Error) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }
  }
}
```

#### 2.2 DTOs avec Zod

**Fichier:** `src/presentation/http/dtos/auth.dto.ts`

```typescript
import { z } from 'zod';

export const SignupDto = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  securityTier: z.enum(['standard', 'dice-key']),
  mnemonic: z.array(z.string()),
  masterKeyHex: z.string().length(64).regex(/^[a-f0-9]+$/i),
  powChallenge: z.string().optional(),
  powNonce: z.number().optional(),
});

export type SignupDto = z.infer<typeof SignupDto>;

export const LoginDto = z.object({
  username: z.string(),
  masterKeyHash: z.string().length(64).regex(/^[a-f0-9]+$/i),
});

export type LoginDto = z.infer<typeof LoginDto>;
```

#### 2.3 Routes Auth (Refactoré)

**Fichier:** `src/presentation/http/routes/auth.routes.ts` (à mettre à jour)

```typescript
import type { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/AuthController.js';
import { requireProofOfWork } from '../../../middleware/proofOfWork.js';
import { createRateLimiter } from '../../../middleware/rateLimiter.js';

export async function authRoutes(app: FastifyInstance) {
  const authController = new AuthController();

  // POST /signup
  app.post('/signup', {
    onRequest: [requireProofOfWork(4), createRateLimiter(5, 3600)],
  }, (req, reply) => authController.signup(req, reply));

  // POST /login
  app.post('/login', {
    onRequest: [createRateLimiter(10, 300)],
  }, (req, reply) => authController.login(req, reply));

  // POST /auth/refresh (TODO)
  // POST /auth/logout (TODO)
}
```

**Migration depuis index.ts:**
```typescript
// AVANT (ligne 200-350 dans index.ts)
app.post('/signup', { onRequest: [requireProofOfWork(4), createRateLimiter(5, 3600)] }, 
  async (request, reply) => {
    // 150 lignes de logique inline
    // ...
});

// APRÈS (dans app.ts)
import { authRoutes } from './presentation/http/routes/auth.routes.js';
await app.register(authRoutes);

// Route devient ~5 lignes, logique dans Controller/UseCase!
```

---

### Jour 4-5: Refactorer Routes Conversations & Messages

Suivre le même pattern:
1. Créer `ConversationController.ts`
2. Créer `MessageController.ts`
3. Créer DTOs avec Zod
4. Mettre à jour routes existantes
5. Extraire logique métier dans Use Cases

**Exemple Use Case:**

**Fichier:** `src/application/use-cases/conversation/CreateConversationUseCase.ts`

```typescript
import type { DatabaseService } from '../../../db/database.js';
import { randomUUID } from 'crypto';

interface CreateConversationInput {
  userId: string;
  targetUsername: string;
}

export class CreateConversationUseCase {
  constructor(private db: DatabaseService) {}

  async execute(input: CreateConversationInput) {
    // 1. Validate target user exists
    const targetUser = this.db.getUserByUsername(input.targetUsername);
    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // 2. Check not creating conversation with self
    if (targetUser.id === input.userId) {
      throw new Error('Cannot create conversation with yourself');
    }

    // 3. Check if conversation already exists
    const existingConversations = this.db.getUserConversations(input.userId);
    for (const conv of existingConversations) {
      const members = this.db.getConversationMembers(conv.id);
      if (members.includes(targetUser.id)) {
        return { conversationId: conv.id, existed: true };
      }
    }

    // 4. Create new conversation
    const conversationId = randomUUID();
    const conversation = this.db.createConversation(
      conversationId,
      [input.userId, targetUser.id]
    );

    return { conversationId: conversation.id, existed: false };
  }
}
```

---

### Jour 6: Créer app.ts (Remplace index.ts)

**Fichier:** `src/app.ts` (NEW)

```typescript
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';

// Routes
import { authRoutes } from './presentation/http/routes/auth.routes.js';
import { conversationRoutes } from './presentation/http/routes/conversation.routes.js';
import { messageRoutes } from './presentation/http/routes/message.routes.js';

// Middleware
import { httpsEnforcement } from './utils/httpsEnforcement.js';

// Database
import { getDatabase } from './db/database.js';

dotenv.config();

export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    ...opts,
  });

  // Database
  const db = getDatabase();

  // Plugins
  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  // CORS
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
  await app.register(cors, {
    origin: (origin, cb) => {
      const isProd = process.env.NODE_ENV === 'production';
      if (!isProd && (!origin || origin === 'null')) return cb(null, true);
      if (allowedOrigins.includes(origin || '')) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  // Security
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  // JWT
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  await app.register(jwt, { secret: jwtSecret });

  // HTTPS enforcement
  app.addHook('onRequest', httpsEnforcement);

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

  // Routes
  await app.register(authRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    reply.code(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  return app;
}

// Start server (for direct execution)
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '4000', 10);
  
  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`[Server] Listening on port ${port}`);
  } catch (error) {
    console.error('[Server] Error starting:', error);
    process.exit(1);
  }
}
```

**Nouveau fichier:** `src/start.ts`

```typescript
import { buildApp } from './app.js';

const app = await buildApp();
const port = parseInt(process.env.PORT || '4000', 10);

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[Server] Listening on port ${port}`);
} catch (error) {
  console.error('[Server] Error starting:', error);
  process.exit(1);
}
```

**Mise à jour package.json:**
```json
{
  "scripts": {
    "dev": "tsx watch src/start.ts",
    "start": "node dist/start.js",
    "dev:legacy": "tsx watch src/index.ts"
  }
}
```

---

### Jour 7: Tests, Cleanup, Documentation

#### 7.1 Écrire Tests Manquants

- Tests `CreateConversationUseCase`
- Tests `SendMessageUseCase`
- Tests `BurnMessagesUseCase`
- Tests Controllers (unit + integration)

#### 7.2 Cleanup

```bash
# Renommer ancien fichier
mv src/index.ts src/index.ts.legacy

# Vérifier build
npm run build

# Vérifier tests
npm test
```

#### 7.3 Documentation

Mettre à jour `README.md` avec nouvelle architecture.

---

## 📊 Métriques Attendues Après Refactoring

### Avant

```
index.ts:                1665 lignes 🔴
Complexité max:          30         🔴
Duplication:             ~30%       🔴
Tests backend:           23 tests   ⚠️
Coverage backend:        ~40%       ⚠️
```

### Après

```
app.ts:                  ~200 lignes ✅
Fichiers moyens:         ~100 lignes ✅
Complexité max:          ~10        ✅
Duplication:             <10%       ✅
Tests backend:           54+ tests  ✅
Coverage backend:        60%+       ✅
```

---

## ✅ Checklist Validation

Après refactoring, vérifier:

- [ ] `index.ts.legacy` renommé (ancien fichier)
- [ ] `app.ts` créé (~200 lignes)
- [ ] Tous Use Cases créés
- [ ] Tous Controllers créés
- [ ] Tous DTOs avec Zod
- [ ] Routes refactorées (10-30 lignes par fichier)
- [ ] WebSocketManager extrait
- [ ] Middleware authenticate extrait
- [ ] Tests backend 54+ tests passed
- [ ] Coverage backend 60%+
- [ ] `npm run build` sans erreurs
- [ ] `npm run lint` passe (warnings OK)
- [ ] Serveur démarre (`npm run dev`)
- [ ] API fonctionne (tests E2E Postman/Playwright)

---

## 🎯 Résultat Final

```
Score Architecture:      95/100  ✅ (+27 depuis 68)
Score Qualité Code:      85/100  ✅ (+20 depuis 65)
Score Tests:             65/100  ✅ (+23 depuis 42)
Score Global:            82/100  ✅ (+8 depuis 74.2)

STATUS: ✅ BETA READY
```

---

**Créé par:** Équipe Audit Technique  
**Date:** 9 Novembre 2025  
**Prochaine révision:** 16 Novembre 2025
