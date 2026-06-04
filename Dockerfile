# ==============================================================================
# 1. Dependencies Stage: Install packages with cache mount
# ==============================================================================
FROM node:20-alpine AS deps

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

# Install all deps (devDeps needed for tsx, vitest, tsc)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --frozen-lockfile

# ==============================================================================
# 2. Test Stage: Type-check and run the full test suite
# ==============================================================================
FROM deps AS test

COPY . .

RUN npm run typecheck
RUN npm test

# ==============================================================================
# 3. Production Stage: Lean runtime image
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Only copy production-relevant files from the deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY tsconfig.json ./

# Persistent data directory for the file-backed store
RUN mkdir -p data \
    && chown -R node:node /usr/src/app

USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/analytics || exit 1

CMD ["npm", "start"]
