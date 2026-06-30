# ─── Stage 1: Build Backend assets ──────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy root dependency specification
COPY package*.json ./

# Install all dependencies (including devDependencies for esbuild/compilation)
RUN npm ci

# Copy tsconfig.json and backend files
COPY tsconfig.json ./
COPY backend/ ./backend/

# Build backend bundle using esbuild
RUN npx esbuild backend/src/server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs

# ─── Stage 2: Create minimal runner ──────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create application folders and assign permissions to the non-root node user
RUN mkdir -p /app/backend/src/db /app/backups && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Copy package specs and install production dependencies
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# Copy compiled backend bundle from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 3000

# Start the API server
CMD ["node", "dist/server.cjs"]
