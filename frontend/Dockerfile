# ─── Stage 1: Build Frontend assets ─────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy root dependency specification
COPY package*.json ./

# Install all dependencies (including devDependencies for Vite compilation)
RUN npm ci

# Copy tsconfig.json and frontend files
COPY tsconfig.json ./
COPY frontend/ ./frontend/

# Set working directory to frontend for the build
WORKDIR /app/frontend

# VITE_API_URL is injected as a build argument
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build frontend static assets to /app/frontend/dist
RUN npx vite build

# ─── Stage 2: Create minimal runner ─────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Switch to non-root user
RUN mkdir -p /app && chown -R node:node /app
USER node

# Copy package specs and install production dependencies
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# Copy server.js and compiled static assets
COPY --chown=node:node frontend/server.js ./server.js
COPY --chown=node:node --from=builder /app/frontend/dist ./dist

EXPOSE 8080

CMD ["node", "server.js"]
