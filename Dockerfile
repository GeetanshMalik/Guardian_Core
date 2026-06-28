# ─── Stage 1: Build Frontend and Backend assets ───────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./
COPY frontend/package*.json ./frontend/ 2>/dev/null || true
COPY backend/package*.json ./backend/ 2>/dev/null || true

# Install all dependencies (including devDependencies for compilation)
RUN npm ci

# Copy application source files
COPY . .

# Build frontend and backend bundles
# This executes: cd frontend && vite build && cd .. && esbuild backend/src/server.ts ...
RUN npm run build

# ─── Stage 2: Create the minimal production runner ──────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create application folders and assign permissions to the non-root node user
RUN mkdir -p /app/backend/src/db /app/backups && \
    chown -R node:node /app

# Switch to the non-root user
USER node

# Copy package specs and install only production dependencies
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# Copy compiled bundles and static assets from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/frontend/dist ./frontend/dist

# Expose the API server port
EXPOSE 3000

# Start the application server
CMD ["node", "dist/server.cjs"]
