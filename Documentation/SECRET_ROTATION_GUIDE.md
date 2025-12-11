# 🔐 Secret Rotation & Management Guide

**Project Chimera (Dead Drop)**  
**Date**: 2025-11-01  
**Author**: Security Team

---

## 📋 Overview

This guide documents the procedure for rotating secrets and managing sensitive configuration in Dead Drop. Follow this guide whenever:
- Deploying to production for the first time
- A developer leaves the team
- Suspected compromise of secrets
- Regular rotation (recommended: every 90 days)

---

## 🚨 Emergency Secret Rotation (Compromised)

If you suspect secrets have been compromised, follow these steps **immediately**:

### Step 1: Generate New Secrets (5 min)

```bash
# Generate new JWT_SECRET (64 bytes = 128 hex chars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate database encryption key (if using SQLCipher)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Save these in a secure password manager (1Password, Bitwarden)
```

### Step 2: Update Production Environment (10 min)

```bash
# Kubernetes Secrets
kubectl create secret generic dead-drop-secrets \
  --from-literal=JWT_SECRET="<new-secret>" \
  --dry-run=client -o yaml | kubectl apply -f -

# AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id dead-drop/jwt-secret \
  --secret-string "<new-secret>"

# Docker Swarm
docker secret create jwt_secret_v2 <(echo "<new-secret>")
docker service update --secret-rm jwt_secret --secret-add jwt_secret_v2 dead-drop
```

### Step 3: Restart Services (5 min)

```bash
# Kubernetes
kubectl rollout restart deployment/dead-drop-bridge

# Docker Compose
docker-compose restart bridge

# PM2
pm2 restart bridge
```

### Step 4: Invalidate Old Sessions (2 min)

All existing JWT tokens will be invalid with the new secret. Users will need to re-authenticate.

**Communication Template**:
```
Subject: Security Update - Re-authentication Required

We've performed a security update that requires all users to log in again.
Your data is safe, but your current session has been invalidated.

Please close and reopen the app, then log in with your mnemonic/Dice-Key.

Thank you for your understanding.
- Dead Drop Security Team
```

### Step 5: Audit & Investigation (30-60 min)

```bash
# Check Git history for leaked secrets
git log --all --full-history -S "JWT_SECRET" --source --all

# Scan for secrets in commits (using gitleaks)
docker run -v $(pwd):/path zricethezav/gitleaks:latest \
  detect --source="/path" --verbose

# Check server logs for suspicious activity
grep "401\|403" /var/log/dead-drop/access.log | tail -100

# Review recent user signups (Sybil attack?)
sqlite3 data/dead-drop.db "SELECT username, created_at FROM users WHERE created_at > $(date -d '1 day ago' +%s)000 ORDER BY created_at DESC;"
```

---

## 🔄 Scheduled Secret Rotation (Every 90 Days)

### Preparation (1 day before)

1. **Schedule maintenance window**
   - Choose low-traffic period (e.g., Sunday 2-4 AM UTC)
   - Notify users 48h in advance

2. **Generate new secrets**
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" > new_jwt_secret.txt
   chmod 600 new_jwt_secret.txt
   ```

3. **Test in staging**
   ```bash
   # Update staging environment
   export JWT_SECRET=$(cat new_jwt_secret.txt)
   npm run dev:bridge
   
   # Run E2E tests
   npm run test:e2e
   ```

### Execution (During Maintenance)

1. **Backup database**
   ```bash
   sqlite3 data/dead-drop.db ".backup backup-$(date +%Y%m%d-%H%M%S).db"
   ```

2. **Update secrets**
   - Follow Step 2 from Emergency Rotation

3. **Rolling restart** (zero downtime)
   ```bash
   # Blue-green deployment
   kubectl set image deployment/dead-drop-bridge bridge=dead-drop:v1.1.0 --record
   kubectl rollout status deployment/dead-drop-bridge
   ```

4. **Verify health**
   ```bash
   curl -f https://api.deaddrop.io/health || echo "FAILED"
   ```

5. **Monitor for 30 minutes**
   - Watch error rates in Sentry
   - Check auth success rate
   - Monitor user complaints

### Rollback Plan

If issues occur:
```bash
# Kubernetes
kubectl rollout undo deployment/dead-drop-bridge

# Restore old secret
kubectl create secret generic dead-drop-secrets \
  --from-literal=JWT_SECRET="<old-secret>" \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## 🏭 Production Secret Management Best Practices

### ✅ DO:
- Store secrets in dedicated secret managers (AWS Secrets Manager, Vault, 1Password)
- Use different secrets for dev/staging/production
- Rotate secrets every 90 days
- Audit secret access logs monthly
- Limit secret access to 2-3 people (principle of least privilege)
- Use environment-specific .env files (`.env.production`, `.env.staging`)
- Encrypt secrets at rest
- Use HTTPS for all secret transmission

### ❌ DON'T:
- Commit secrets to Git (even in private repos)
- Share secrets via Slack/Email/SMS
- Hardcode secrets in source code
- Use the same secret across environments
- Store secrets in plain text files
- Log secrets (sanitize logs)
- Use weak/short secrets (<32 characters)
- Reuse secrets from other projects

---

## 🔧 Development Environment Setup

### For New Developers

1. **Clone repository**
   ```bash
   git clone https://github.com/your-org/dead-drop.git
   cd dead-drop
   ```

2. **Copy environment template**
   ```bash
   cp apps/bridge/.env.example apps/bridge/.env
   ```

3. **Generate development secrets**
   ```bash
   # Generate JWT_SECRET
   JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
   
   # Update .env file (macOS/Linux)
   sed -i '' "s/please-change-this-to-a-strong-32+char-secret/$JWT_SECRET/" apps/bridge/.env
   
   # Update .env file (Windows PowerShell)
   (Get-Content apps/bridge/.env) -replace 'please-change-this-to-a-strong-32+char-secret', $JWT_SECRET | Set-Content apps/bridge/.env
   ```

4. **Verify .env is gitignored**
   ```bash
   git status apps/bridge/.env
   # Should output: "nothing to commit" or not list .env
   ```

5. **Install pre-commit hooks**
   ```bash
   npm install --save-dev @commitlint/cli husky
   npx husky install
   
   # Add pre-commit hook to check for secrets
   cat > .husky/pre-commit << 'EOF'
   #!/bin/sh
   . "$(dirname "$0")/_/husky.sh"
   
   # Check for secrets in staged files
   if git diff --cached --name-only | grep -E "\.env$" ; then
     echo "❌ ERROR: Attempting to commit .env file!"
     echo "Please unstage: git reset HEAD apps/bridge/.env"
     exit 1
   fi
   
   # Scan for hardcoded secrets
   if git diff --cached -U0 | grep -iE "(jwt_secret|api_key|password|secret_key)\s*=\s*['\"]?[a-zA-Z0-9]{20,}" ; then
     echo "⚠️  WARNING: Potential secret detected in commit!"
     echo "Review your changes carefully."
     exit 1
   fi
   EOF
   chmod +x .husky/pre-commit
   ```

---

## 📊 Secret Rotation Checklist

Use this checklist for each rotation:

```markdown
## Secret Rotation - [Date]

### Pre-Rotation
- [ ] Maintenance window scheduled
- [ ] Users notified 48h in advance
- [ ] New secrets generated securely
- [ ] Secrets tested in staging environment
- [ ] Database backup completed
- [ ] Rollback plan documented

### Rotation
- [ ] Production secrets updated
- [ ] Services restarted (blue-green)
- [ ] Health checks passed
- [ ] Auth endpoints tested
- [ ] WebSocket connections working

### Post-Rotation
- [ ] Monitored for 30 minutes
- [ ] No error spikes in Sentry
- [ ] User authentication success rate normal (>95%)
- [ ] Old secrets securely deleted
- [ ] Rotation documented in changelog
- [ ] Team notified of completion

### Rollback (if needed)
- [ ] Old secrets restored
- [ ] Services restarted
- [ ] Incident post-mortem scheduled
```

---

## 🔐 Secret Types in Dead Drop

| Secret Type | Location | Rotation Frequency | Impact if Compromised |
|-------------|----------|-------------------|----------------------|
| **JWT_SECRET** | `apps/bridge/.env` | 90 days | 🔴 CRITICAL - All sessions compromised |
| **Database Encryption Key** | Environment | 180 days | 🔴 CRITICAL - All data readable |
| **Master Key Hashes** | Database | Never (hashed) | 🟡 MEDIUM - User-specific |
| **ALLOWED_ORIGINS** | `apps/bridge/.env` | As needed | 🟢 LOW - CORS bypass only |
| **SSL/TLS Certificates** | Nginx/Caddy | 90 days (auto) | 🔴 CRITICAL - MITM attacks |

---

## 🧪 Testing Secret Rotation

### Test Locally

```bash
# Terminal 1: Start server with old secret
JWT_SECRET="old-secret-for-testing-only" npm run dev:bridge

# Terminal 2: Get token
TOKEN=$(curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"method":"standard","username":"testuser","mnemonicLength":12}' \
  | jq -r '.token')

# Terminal 2: Verify token works
curl http://localhost:4000/conversations \
  -H "Authorization: Bearer $TOKEN"
# Should return: []

# Terminal 1: Stop server, restart with new secret
JWT_SECRET="new-secret-for-testing-only" npm run dev:bridge

# Terminal 2: Try same token (should fail)
curl http://localhost:4000/conversations \
  -H "Authorization: Bearer $TOKEN"
# Should return: 401 Unauthorized ✅
```

---

## 📞 Incident Response Contacts

| Role | Name | Contact | Escalation |
|------|------|---------|------------|
| Security Lead | [Name] | security@deaddrop.io | Primary |
| DevOps Lead | [Name] | devops@deaddrop.io | Infrastructure |
| On-Call Engineer | [Rotation] | oncall@deaddrop.io | 24/7 |
| Legal/Compliance | [Name] | legal@deaddrop.io | Breach reporting |

---

## 📚 References

- [OWASP Secret Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [NIST SP 800-57 - Key Management](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)
- [CIS Controls - Secret Management](https://www.cisecurity.org/controls/v8)

---

**Last Updated**: 2025-11-01  
**Next Review**: 2026-02-01  
**Version**: 1.0
