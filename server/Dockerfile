# ==============================================================================
# Stage 1: Build TypeScript server
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace package definitions
COPY package*.json ./
COPY server/package*.json ./server/
COPY shared ./shared

# Install dependencies
RUN npm ci --workspace=server

# Copy server source code and TypeScript config
COPY server ./server

# Build TypeScript output
RUN npm run build --workspace=server

# ==============================================================================
# Stage 2: Production runtime image with Docker CLI
# ==============================================================================
FROM node:20-alpine AS production

# Install Docker CLI for container orchestration over /var/run/docker.sock
RUN apk add --no-cache docker-cli

WORKDIR /app

# Copy package definitions and install production dependencies only
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --workspace=server --omit=dev

# Copy compiled JavaScript output from builder
COPY --from=builder /app/server/dist ./server/dist
COPY shared ./shared

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server/dist/server/src/index.js"]
