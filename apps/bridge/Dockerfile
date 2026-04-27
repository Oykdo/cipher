# syntax=docker/dockerfile:1
#
# Cipher bridge — production image (privacy-l1).
# Targeted at Fly.io (free shared-cpu-1x / 512 MB) but image-portable to
# any container runtime. Multi-stage to keep the runtime image small.
#
# Build:    docker build -t cipher-bridge .
# Run:      docker run -p 4000:4000 \
#               -e DATABASE_URL=postgres://... \
#               -e JWT_SECRET=... \
#               cipher-bridge

# ─── Build stage ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# argon2 ships C bindings; alpine doesn't carry build tools by default.
RUN apk add --no-cache python3 make g++

# Install ALL deps (incl. devDeps — we need tsc to compile).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source + compile TypeScript → dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Runtime stage ─────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Install runtime-only deps. Build tools added then removed to keep
# the final layer small while still letting argon2 / pg-native compile.
RUN apk add --no-cache python3 make g++ \
 && apk add --no-cache --virtual .build-deps tini

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && apk del python3 make g++

# Bring in the compiled JS, the static assets the bridge serves
# (avatars), and the SQL the migration scripts may reference.
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY scripts ./scripts

# BRIDGE_DATA_DIR defaults to ./data; if you mount a volume at /data
# (recommended on Fly), set BRIDGE_DATA_DIR=/data via fly.toml.
RUN mkdir -p /app/data/uploads

EXPOSE 4000

# tini gives us proper PID 1 signal handling (clean shutdown on SIGTERM
# from Fly's deploy / scale-down events — important for graceful socket
# closure).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
