# Phase 11: Deployment

## Objective

Establish a production-ready containerization and orchestration structure. Write multi-stage Dockerfiles, configure an Nginx proxy, orchestrate services with Docker Compose, and compile a deployment manual.

---

## Requirements

- Create a Docker file for the backend (`server/Dockerfile`):
  - Use a multi-stage build (Stage 1: build TS, Stage 2: production runtime).
  - Install the Docker CLI inside the runtime image so it can issue commands to the host engine.
  - Ensure the process runs as a non-root user that belongs to the group allowed to interact with the Docker socket (typically gid `999` or dynamic setup).
- Create a Docker file for the frontend (`client/Dockerfile`):
  - Stage 1: Build the React code using Vite.
  - Stage 2: Serve compiled static assets via an `nginx:alpine` image.
- Create Nginx configuration (`client/nginx.conf`):
  - Route static file requests to the build output.
  - Redirect API requests `/api/*` to the backend Express server `http://server:5000`.
  - Support Single Page Application routing (rewrites fallback to `index.html`).
- Create orchestration configuration (`docker-compose.yml`):
  - Define `client` and `server` services.
  - Mount the host's Docker socket into the server container (`/var/run/docker.sock:/var/run/docker.sock`) so the server can spawn sibling runner containers.
  - Configure shared networks and restart policies.
- Write a deployment manual `docs/DEPLOYMENT.md` detailing setup, environment flags, port configuration, and Docker socket security configurations.

---

## Technical Considerations

- **Docker-out-of-Docker (DooD)**: Sharing `/var/run/docker.sock` exposes the host to security risks if the server is compromised. Document this clearly in the deployment manual and specify permissions hardening (read/write access restricted to the server container user group).
- **Production Variables**: Ensure CORS settings, API timeouts, and rate limits are driven by environment variables (`.env`).

---

## Files/Components Expected

- `server/Dockerfile`: Server multi-stage image template.
- `client/Dockerfile`: Client image template.
- `client/nginx.conf`: Nginx reverse proxy routes.
- `docker-compose.yml`: Root orchestration engine.
- `docs/DEPLOYMENT.md`: Detailed configuration and production setup manual.

---

## Acceptance Criteria

1.  Running `docker-compose up --build -d` builds and fires both client and server containers.
2.  Navigating to `http://localhost` (port 80) loads the Compiler for All application.
3.  Piping a execution request works end-to-end: the containerized server spawns a sandboxed C++ container on the host engine, reads output, and returns it.
4.  All source maps and developer dependencies are omitted from the production container build layers.

---

## Things the agent must not do

- **DO NOT** expose raw database ports or internal backend ports (`5000`) directly to the public host ports. Only port `80` (or `443` if SSL is added) on the Nginx container should be exposed.
- **DO NOT** write root passwords or environment secrets directly into the Dockerfiles or Compose files. Use references to `.env` variables.
