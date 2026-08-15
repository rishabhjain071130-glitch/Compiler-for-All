# ==============================================================================
# Stage 1: Build React Vite SPA
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace package definitions
COPY package*.json ./
COPY client/package*.json ./client/
COPY shared ./shared

# Install dependencies
RUN npm ci --workspace=client

# Copy client source code
COPY client ./client

# Build Vite static assets
RUN npm run build --workspace=client

# ==============================================================================
# Stage 2: Serve via Nginx reverse proxy
# ==============================================================================
FROM nginx:alpine AS production

# Copy custom Nginx proxy configuration
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
