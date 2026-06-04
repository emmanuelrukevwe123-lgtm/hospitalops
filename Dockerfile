# ==============================================================================
# 1. deps: install ALL packages (dev included — needed for tsc, tsx, vitest)
# ==============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json /app/

RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ==============================================================================
# 2. prod-deps: install only production packages for the lean runtime image
# ==============================================================================
FROM node:20-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json /app/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ==============================================================================
# 3. test: type-check and run the full test suite
# ==============================================================================
FROM deps AS test

COPY . /app/

RUN npm run typecheck
RUN npm test

# ==============================================================================
# 4. runner: lean production image — no devDependencies, no test files
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --chown=node:node package.json package-lock.json /app/
COPY --chown=node:node src/ /app/src/
COPY --chown=node:node public/ /app/public/
COPY --chown=node:node tsconfig.json /app/

RUN mkdir -p data && chown node:node data

USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/analytics || exit 1

CMD ["npm", "start"]
