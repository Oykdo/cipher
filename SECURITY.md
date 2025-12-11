# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

**DO NOT** report security vulnerabilities through public GitHub issues.

Instead, please report them responsibly through one of the following methods:

### 📧 Email

Send an email to **[security@cipherpulse.io]** with:

- **Subject**: Security Vulnerability Report - [Brief Description]
- **Description**: Detailed description of the vulnerability
- **Steps to reproduce**: Clear steps to reproduce the issue
- **Impact**: Potential impact and severity
- **Suggested fix**: If you have a proposed solution (optional)
- **Your contact info**: For follow-up questions

### 🔒 GitHub Security Advisory

1. Go to [https://github.com/Oykdo/cipher/security/advisories](https://github.com/Oykdo/cipher/security/advisories)
2. Click "New draft security advisory"
3. Fill in the details
4. Submit privately

---

## Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix timeline**: Depends on severity
  - **Critical**: 1-3 days
  - **High**: 7-14 days
  - **Medium**: 14-30 days
  - **Low**: 30-60 days

---

## Disclosure Policy

We follow **coordinated disclosure**:

1. You report the vulnerability privately
2. We confirm the issue and work on a fix
3. We release a patch and security advisory
4. After 30 days (or once 95% of users have updated), you may publicly disclose

We request that you:
- Give us reasonable time to fix the issue before public disclosure
- Make a good faith effort to avoid privacy violations, data destruction, and service interruption

---

## Security Measures

### Cryptography

- **E2EE**: All messages use Signal Protocol's Double Ratchet
- **Key exchange**: X3DH (Extended Triple Diffie-Hellman)
- **Encryption**: AES-256-GCM
- **Signatures**: Ed25519
- **Key derivation**: PBKDF2 (100,000 iterations) + Argon2id
- **Hashing**: SHA-512

### Authentication

- **SRP**: Secure Remote Password (zero-knowledge)
- **JWT**: Short-lived access tokens (15min) + refresh tokens
- **Rate limiting**: Protection against brute-force attacks
- **2FA**: Planned for v1.1

### Transport Security

- **TLS 1.3**: Enforced for all connections
- **HSTS**: HTTP Strict Transport Security
- **Certificate pinning**: Planned for mobile apps

### Application Security

- **CSP**: Content Security Policy to prevent XSS
- **CSRF protection**: Double-submit cookie pattern
- **Input validation**: Zod schemas on frontend + backend
- **Sanitization**: DOMPurify for user-generated content
- **SQL injection protection**: Parameterized queries

### Infrastructure

- **Zero-trust architecture**: Server never has access to plaintext messages
- **Minimal logging**: Only security events, no message content
- **Regular updates**: Dependencies updated within 30 days of security releases

---

## Known Limitations

### Out of Scope

The following are **not considered vulnerabilities**:

- **Device compromise**: If an attacker has physical or remote access to your device, they can access your messages
- **Quantum computers**: Current crypto is not post-quantum (planned for v1.1)
- **Social engineering**: We can't protect against phishing, pretexting, etc.
- **Denial of Service**: We have rate limiting, but sophisticated DDoS is out of scope
- **Metadata analysis**: While we minimize metadata, we don't provide Tor-level anonymity
- **Screenshot/keylogger**: Desktop/mobile OS security is user's responsibility

### Threat Model

**We protect against:**
- ✅ Network eavesdropping
- ✅ Server compromise
- ✅ Man-in-the-middle attacks
- ✅ Replay attacks
- ✅ Brute-force attacks
- ✅ Key compromise (with perfect forward secrecy)

**We don't protect against:**
- ❌ Endpoint compromise (malware on your device)
- ❌ Physical access to unlocked device
- ❌ Coerced disclosure of passwords
- ❌ Quantum computers (yet)

---

## Security Audits

- **Internal audit**: December 2024 (see `SECURITY_AUDIT_REPORT.md`)
- **External audit**: Planned for Q2 2025

We welcome independent security researchers to review our code.

---

## Bug Bounty Program

We currently do not have a formal bug bounty program, but we greatly appreciate responsible disclosure. Security researchers who report valid vulnerabilities will be:

- Publicly acknowledged (if desired)
- Listed in our Hall of Fame
- Considered for rewards on a case-by-case basis

---

## Security Updates

Subscribe to security updates:
- **GitHub Watch**: Click "Watch" → "Custom" → "Security alerts"
- **Release notes**: Check [Releases](https://github.com/Oykdo/cipher/releases) for security patches

---

## Hall of Fame

Security researchers who have responsibly disclosed vulnerabilities:

_No entries yet - be the first!_

---

## Questions?

For general security questions (non-vulnerabilities), you can:
- Open a GitHub Discussion
- Email [security@cipherpulse.io] with "Question" in the subject

For actual vulnerabilities, always report privately.

---

**Thank you for helping keep Cipher Pulse and its users safe!** 🛡️

