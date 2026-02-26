# ==============================================================================
# 1. Base Stage: Install dependencies and set up workspace
# ==============================================================================
FROM node:20-alpine AS base

# Set working directory
WORKDIR /usr/src/app

# Copy dependency definitions
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies as they contain tsx and typescript)
RUN npm ci

# ==============================================================================
# 2. Development & Test Stage: Copy source and run verification
# ==============================================================================
FROM base AS test

# Copy rest of the application files
COPY . .

# Run type check and tests to ensure the build is healthy
RUN npm run typecheck
RUN npm test

# ==============================================================================
# 3. Production Stage: Clean running environment
# ==============================================================================
FROM base AS runner

# Copy application source code
COPY . .

# Create the data directory for the file-backed JSON store (if it doesn't exist)
# and ensure it's writable by the node user
RUN mkdir -p data && chown -R node:node data

# Use non-root node user for safety
USER node

# Expose port if a web server is added later (default is 3000, comment out if not needed)
# EXPOSE 3000

# Set Node environment to production
ENV NODE_ENV=production

# Default command to start the application using tsx
CMD ["npm", "start"]
