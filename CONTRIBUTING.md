# Contributing to Cipher Pulse

First off, thank you for considering contributing to Cipher Pulse! It's people like you that make Cipher Pulse such a great tool for privacy and security.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Security](#security)

---

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [security@cipherpulse.io].

---

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

**Required information:**
- **Description**: Clear and concise description of the bug
- **Steps to reproduce**: Numbered list of steps
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Environment**:
  - OS (Windows/macOS/Linux + version)
  - Node.js version
  - Electron version (if desktop app)
  - Browser (if web app)
- **Logs**: Relevant error messages or console output

**Example:**

```markdown
## Bug: Messages not decrypting after key rotation

### Steps to reproduce
1. Start conversation with User A
2. Send 50+ messages
3. Key rotation happens automatically
4. Send new message
5. Message fails to decrypt for recipient

### Expected behavior
Message should decrypt correctly after key rotation

### Actual behavior
Message shows "Decryption failed" error

### Environment
- OS: Windows 11
- Node.js: 22.1.0
- Electron: 30.5.1

### Logs
```
[E2EE] Key rotation completed: session_abc123
[Error] Failed to decrypt message: Invalid MAC
```
```

### 💡 Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful** to most Cipher Pulse users
- **List some examples** of how this feature would be used

### 🌍 Translating

We welcome translations to new languages! Current supported languages:
- English (🇬🇧)
- Français (🇫🇷)
- Deutsch (🇩🇪)
- Español (🇪🇸)
- Italiano (🇮🇹)
- 中文 (🇨🇳)

**To add a new language:**

1. Copy `apps/frontend/src/locales/en.json` to `apps/frontend/src/locales/[YOUR_LANG_CODE].json`
2. Translate all strings (keep the keys unchanged)
3. Add your language to `apps/frontend/src/i18n.ts`:
   ```typescript
   import fr from './locales/fr.json';
   import YOUR_LANG from './locales/YOUR_LANG.json';
   
   // ...
   
   resources: {
     en: { translation: en },
     fr: { translation: fr },
     YOUR_LANG: { translation: YOUR_LANG },
   }
   ```
4. Test all screens with your translation
5. Submit a Pull Request

### 📖 Improving Documentation

Documentation improvements are always welcome! This includes:
- Fixing typos or grammar
- Adding examples
- Clarifying confusing sections
- Adding new guides
- Translating documentation

---

## Development Setup

### Prerequisites

- **Node.js** 22.x LTS
- **PostgreSQL** 15+ (or Neon/Supabase cloud database)
- **Git**
- **Code editor** (VSCode recommended)

### Initial Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/cipher.git
cd cipher

# 3. Add upstream remote
git remote add upstream https://github.com/Oykdo/cipher.git

# 4. Install dependencies
npm install

# 5. Set up environment variables
cp apps/bridge/.env.example apps/bridge/.env
# Edit apps/bridge/.env with your local configuration

# 6. Run database migrations
cd apps/bridge
npm run db:migrate
cd ../..

# 7. Start development servers
npm run dev
```

### Project Structure

```
cipher-pulse/
├── apps/
│   ├── bridge/          # Backend (Fastify + PostgreSQL)
│   └── frontend/        # Frontend (React + Vite)
├── main.js              # Electron main process
├── preload.cjs          # Electron preload
└── package.json         # Root package
```

### Running Tests

```bash
# Run all tests
npm test

# Run backend tests only
cd apps/bridge && npm test

# Run frontend tests only
cd apps/frontend && npm test

# Run tests in watch mode
npm run test:watch
```

### Building

```bash
# Build backend
npm run build:bridge

# Build frontend
npm run build:frontend

# Build everything
npm run build:all

# Build desktop app
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux
```

---

## Coding Standards

### TypeScript

- **Use TypeScript** for all new code (`.ts` and `.tsx` files)
- **Enable strict mode** - all type errors must be resolved
- **Avoid `any` types** - use proper types or `unknown` with type guards
- **Use interfaces over types** for object shapes (unless you need unions/intersections)

**Example:**

```typescript
// ✅ Good
interface User {
  id: string;
  username: string;
  publicKey: Uint8Array;
}

function getUserById(id: string): Promise<User | null> {
  // ...
}

// ❌ Bad
function getUser(id: any): any {
  // ...
}
```

### React Components

- **Use functional components** with hooks (no class components)
- **Use TypeScript** for props
- **Extract complex logic** into custom hooks
- **Use `useMemo` and `useCallback`** for expensive computations
- **Name components** using PascalCase

**Example:**

```typescript
// ✅ Good
interface MessageProps {
  content: string;
  timestamp: number;
  encrypted: boolean;
}

export function Message({ content, timestamp, encrypted }: MessageProps) {
  const formattedTime = useMemo(() => formatTimestamp(timestamp), [timestamp]);
  
  return (
    <div className="message">
      {encrypted && <LockIcon />}
      <p>{content}</p>
      <time>{formattedTime}</time>
    </div>
  );
}

// ❌ Bad
export function message(props: any) {
  return <div>{props.content}</div>;
}
```

### Code Formatting

We use **Prettier** for consistent formatting:

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

**VSCode settings** (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

### Linting

We use **ESLint** for code quality:

```bash
# Lint all files
npm run lint

# Lint and fix
npm run lint:fix
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files | camelCase or kebab-case | `userService.ts`, `message-input.tsx` |
| Components | PascalCase | `MessageList.tsx` |
| Functions | camelCase | `encryptMessage()` |
| Variables | camelCase | `userId`, `encryptedPayload` |
| Constants | UPPER_SNAKE_CASE | `MAX_MESSAGE_LENGTH` |
| Interfaces | PascalCase | `interface User {}` |
| Types | PascalCase | `type Status = 'online' | 'offline'` |

---

## Commit Messages

We follow the **Conventional Commits** specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, build config, etc.)
- `security`: Security fixes

### Examples

```bash
# Feature
git commit -m "feat(e2ee): implement X3DH key exchange"

# Bug fix
git commit -m "fix(auth): prevent race condition in SRP verification"

# Documentation
git commit -m "docs(readme): add installation instructions"

# Security fix
git commit -m "security(websocket): add access control for conversation rooms"
```

### Detailed commit message

```
feat(p2p): add WebRTC connection manager

Implement a connection manager that handles WebRTC peer connections
with automatic reconnection and fallback to relay server.

- Add PeerConnection class
- Implement ICE candidate gathering
- Add STUN/TURN server configuration
- Implement connection state tracking

Closes #123
```

---

## Pull Request Process

### Before Submitting

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow coding standards
   - Add tests for new features
   - Update documentation

3. **Run tests and linting**
   ```bash
   npm test
   npm run lint
   npm run format:check
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: your amazing feature"
   ```

5. **Pull latest changes from upstream**
   ```bash
   git fetch upstream
   git rebase upstream/master
   ```

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

### Creating the Pull Request

1. Go to your fork on GitHub
2. Click "New Pull Request"
3. Select your feature branch
4. Fill in the PR template:

```markdown
## Description
Brief description of your changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?
Describe the tests you ran

## Checklist
- [ ] My code follows the coding standards
- [ ] I have added tests
- [ ] All tests pass
- [ ] I have updated the documentation
- [ ] My commits follow the commit message convention
```

### Review Process

- **Maintainers will review** your PR within 7 days
- **Respond to feedback** - make requested changes
- **Keep PR focused** - one feature/fix per PR
- **Rebase if needed** - to resolve conflicts
- **CI must pass** - all tests and linting

---

## Security

**DO NOT** open GitHub issues for security vulnerabilities.

Instead:
1. Email **[security@cipherpulse.io]**
2. Or create a **private security advisory** on GitHub
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within **48 hours** and work with you to address the issue before public disclosure.

---

## Questions?

- **General questions**: Open a GitHub Discussion
- **Bug reports**: Open a GitHub Issue
- **Security issues**: Email [security@cipherpulse.io]

---

Thank you for contributing to Cipher Pulse! 🙏

