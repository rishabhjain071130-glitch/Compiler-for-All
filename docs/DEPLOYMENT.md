# Production Deployment Guide: Compiler for All

This guide provides step-by-step instructions for deploying **Compiler for All** to a production Linux VPS or cloud instance.

---

## 1. System & Hardware Requirements

- **Operating System**: Linux (Ubuntu 22.04 LTS or Debian 12 recommended).
- **CPU**: 2 Cores minimum (4 Cores recommended for high concurrency).
- **RAM**: 2 GB RAM minimum (4 GB recommended).
- **Software Dependencies**:
  - Docker Engine (`v24.0+`)
  - Docker Compose (`v2.20+` or `docker-compose`)
  - Git

---

## 2. Docker Toolchain Pre-pulling

Compiler for All uses four official, pinned language images for ephemeral sandbox isolation. Pre-pull these images on the host server before launching the application stack:

```bash
docker pull gcc:12-bookworm
docker pull eclipse-temurin:17-jdk
docker pull python:3.10-slim
docker pull node:18-slim
```

---

## 3. Environment Configuration

1. Clone the project repository:

   ```bash
   git clone https://github.com/rishabhjain071130-glitch/Compiler-for-All.git
   cd Compiler-for-All
   ```

2. Create a production `.env` file from the template:

   ```bash
   cp .env.example .env
   ```

3. Configure environment variables inside `.env`:
   ```env
   PORT=5000
   NODE_ENV=production
   CORS_ORIGIN=http://your-domain.com
   ```

---

## 4. Production Orchestration Launch

Build and start the application stack using Docker Compose:

```bash
docker compose up --build -d
```

### Stack Architecture

- **`cfa-client` (Port 80)**: Serves compiled React static assets via Nginx and proxies `/api/*` requests internally to `http://server:5000`.
- **`cfa-server` (Internal Port 5000)**: Express API backend interacting with host Docker daemon over `/var/run/docker.sock`.

---

## 5. Security & Docker Socket Hardening

The backend container mounts `/var/run/docker.sock` to orchestrate isolated ephemeral containers on the host. To secure this setup:

1. **Host Port Protection**: Ensure port `5000` is **NOT** exposed directly to the public internet. Only port `80` (or `443` for HTTPS) should be open in your cloud firewall / security group.
2. **Container Permissions**: The `cfa-server` container executes as a non-root user or restricted process with access scoped strictly to the Docker CLI socket.
3. **Sandbox Isolation Flags**: User code inside ephemeral containers executes with strict security parameters:
   - `--network none` (No network interface)
   - `-m 64m --memory-swap 64m` (64MB memory quota)
   - `--cpus 0.5` (0.5 CPU core quota)
   - `--pids-limit 50` (PID fork bomb limit)
   - `--user 1000:1000` (Unprivileged user execution)
   - `--read-only` (Read-only root filesystem)
   - `--tmpfs /tmp:rw,exec,nosuid,size=5m` (5MB RAM tmpfs)
   - `--ulimit nofile=64:64` (File descriptor limit)
   - `-v [workspace]:/workspace:ro` (Read-only source mount)
   - `--rm` & `--name cfa-exec-XXX` (Automated cleanup on exit or timeout)

---

## 6. HTTPS & Reverse Proxy Setup (Optional / Recommended)

To enable HTTPS with Let's Encrypt / Certbot using Nginx on the host:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

---

## 7. Monitoring & Operational Commands

- **Check Service Logs**:
  ```bash
  docker compose logs -f
  ```
- **Verify Stack Status**:
  ```bash
  docker compose ps
  ```
- **Stop Application Stack**:
  ```bash
  docker compose down
  ```
- **Restart Application Stack**:
  ```bash
  docker compose restart
  ```
