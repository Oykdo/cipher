# Cipher

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

**A secure messaging application focused on end-to-end encryption, privacy-first communication, and resilient delivery.**

[Overview](#overview) | [Status](#status) | [Features](#features) | [Architecture](#architecture) | [Development](#development) | [Security](#security)

</div>

---

## Overview

Cipher is the communication surface of the broader `Cipher + Eidolon` direction.

The current product model is:

- `Cipher` handles messaging, conversations, attachments, and the daily user experience.
- `Eidolon` becomes the strong identity and trust layer behind secure access.

In practical terms, the long-term direction is:

- users open `Cipher`
- users authenticate through `Eidolon`
- vault identity and possession of cryptographic key material become the root of trust

Cipher should remain a communication product. It should not become a vault UI, a game layer, or a token dashboard.

---

## Status

Cipher is under active refactoring and documentation alignment.

Important context:

- the repository still contains some legacy naming such as `Dead Drop` and `Cipher Pulse`
- the product direction is now being clarified around `Cipher` as the visible app and `Eidolon` as the security layer
- not every planned Eidolon integration is exposed as a polished end-user flow yet

This README reflects the intended GitHub presentation of the project as it stands today, without pretending every future integration is already complete.

---

## Features

### End-to-end encrypted messaging

- secure conversation flows
- modern cryptographic primitives in both frontend and backend
- server is treated as transport and coordination infrastructure, not as a trusted reader of message content

### Privacy-oriented communication

- burn-after-reading flows
- time-locked message concepts
- encrypted attachment handling
- reduced trust assumptions compared to conventional messaging products

### Real-time and resilient transport

- Socket.IO-based real-time updates
- optional peer-to-peer capabilities in the frontend stack
- relay-compatible architecture for cases where direct transport is not possible

### Desktop and web delivery

- Electron desktop shell
- React frontend
- Node/Fastify backend

### Multi-language support

The frontend already includes internationalization support for:

- English
- French
- German
- Spanish
- Italian
- Simplified Chinese

---

## Cipher and Eidolon

The current strategic separation is simple:

- `Cipher` = messaging product
- `Eidolon` = identity, vault, trust, and strong authentication layer

The intended integration path is:

1. Cipher remains the user-facing communication app.
2. Eidolon provides strong identity proof through vault-linked key material.
3. Authentication evolves toward possession-based access rather than a conventional password-only model.

This repo should therefore be read as a secure messaging project that is progressively being aligned with an external trust layer, not as a standalone tokenized product.

---

## Architecture

### Stack

#### Frontend

- React 19
- TypeScript
- Vite
- Zustand
- Framer Motion
- i18next
- libsodium
- Socket.IO client
- simple-peer

#### Backend

- Node.js 22
- TypeScript
- Fastify
- PostgreSQL
- Socket.IO
- Argon2
- JWT
- Zod

#### Desktop

- Electron

### Monorepo layout

```text
Cipher/
|-- apps/
|   |-- bridge/        # Backend API and realtime services
|   `-- frontend/      # React frontend
|-- assets/            # Icons and packaging assets
|-- Documentation/     # Project documentation
|-- main.js            # Electron main process
|-- preload.cjs        # Electron preload layer
`-- package.json       # Root scripts and desktop packaging
```

---

## Development

### Prerequisites

- Node.js 22 or newer
- PostgreSQL 15 or newer
- Git

### Install

```bash
git clone https://github.com/Oykdo/Project_Chimera.git
cd Project_Chimera/Cipher
npm install
```

### Configure the backend

Copy the example environment file and adjust it for your local setup:

```bash
cp apps/bridge/.env.example apps/bridge/.env
```

Then run the backend migration script:

```bash
cd apps/bridge
npm run db:migrate
cd ../..
```

### Run in development

```bash
npm run dev
```

This starts:

- the backend in `apps/bridge`
- the frontend in `apps/frontend`
- the Electron shell after the frontend is ready

Default local endpoints:

- frontend: `http://localhost:5173`
- backend API: `http://localhost:4000`

### Build

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

---

## Security

Cipher is built around a privacy-first and trust-minimizing model, but it is important to state the limits clearly.

- end-to-end encryption does not protect a compromised endpoint
- screenshots, malware, keyloggers, and unsafe recovery handling remain user-side risks
- resilient transport does not mean anonymous transport by default
- planned Eidolon-based authentication improves trust boundaries, but does not replace endpoint hygiene

If you report a security issue, use the process described in [SECURITY.md](./SECURITY.md).

---

## Current priorities

- stabilize the core messaging flows
- clean up legacy naming and presentation
- align authentication flows with the Eidolon trust model
- improve documentation accuracy across the monorepo
- keep the GitHub presentation honest about what is implemented versus what is directional

---

## Contributing

Contributions are welcome. For setup, conventions, and pull request guidance, see:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

---

## License

This project is released under the MIT License. See [LICENSE](./LICENSE).
