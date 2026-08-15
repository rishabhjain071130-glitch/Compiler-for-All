# Compiler for All

> Zero-config multi-language code editor and execution sandbox built for beginner programmers.

**Compiler for All** provides an intuitive IDE experience where users type code in **C**, **C++**, **Java**, **Python**, or **JavaScript**, and the platform authoritatively detects the language, configures syntax highlighting, parses errors, and executes the code inside a hardened Docker security sandbox.

---

## Key Features

- **Multi-Signal Automatic Language Detection**: Server-side multi-signal engine analyzing code structure, syntax keywords, standard library imports, and syntactic markers to identify programming languages in real time.
- **Monaco Code Editor**: Premium IDE editor with dark glassmorphic styling, line numbers, error squiggles, and dynamic model language switching.
- **Hardened Docker Security Sandbox**: Untrusted code executes inside ephemeral Docker containers with gVisor / kernel isolation, memory limits (64MB), CPU quotas (0.5 cores), PID limits (50 processes), read-only root filesystems, and complete network blocks (`--network none`).
- **Beginner-Friendly Error Formatting**: Diagnostic output parser extracting 1-indexed line and column numbers, attaching Monaco markers, and translating raw compiler/runtime dumps into beginner-friendly explanations.
- **Interactive Stdin Processing**: Standard input buffers piped directly to process stdin streams without leaking input data into source files.
- **Graceful Execution Fallback**: Automatically probes Docker availability (`isDockerAvailable()`). If Docker is offline or unconfigured, safely returns structured HTTP 503 errors without running code on the host system.

---

## Supported Languages & Toolchain Registry

| Language       | Extension | Compiler / Interpreter Image | Default Version  | Compile & Run Command                                         |
| :------------- | :-------: | :--------------------------- | :--------------- | :------------------------------------------------------------ |
| **C**          |   `.c`    | `gcc:12-bookworm`            | GCC 12.5 (C11)   | `gcc -O2 -std=c11 -Wall main.c -o /tmp/main && /tmp/main`     |
| **C++**        |  `.cpp`   | `gcc:12-bookworm`            | G++ 12.5 (C++17) | `g++ -O2 -std=c++17 -Wall main.cpp -o /tmp/main && /tmp/main` |
| **Java**       |  `.java`  | `eclipse-temurin:17-jdk`     | OpenJDK 17       | `javac -d /tmp Main.java && java -cp /tmp Main`               |
| **Python**     |   `.py`   | `python:3.10-slim`           | Python 3.10      | `python3 main.py`                                             |
| **JavaScript** |   `.js`   | `node:18-slim`               | Node.js 18       | `node main.js`                                                |

---

## Security Restrictions

All user execution containers enforce the following security sandbox flags:

```bash
docker run --rm \
  --name cfa-exec-[id] \
  --network none \
  -m 64m --memory-swap 64m \
  --cpus 0.5 \
  --user 1000:1000 \
  --read-only \
  --tmpfs /tmp:rw,exec,nosuid,size=5m \
  --pids-limit 50 \
  --ulimit nofile=64:64 \
  -v /tmp/cfa-sandbox-xyz:/workspace:ro \
  -w /tmp \
  [image] sh -c "[command]"
```

- **Zero Host Execution**: User code never executes directly on the host operating system.
- **No Privileged Execution**: Containers run with unprivileged user UID/GID 1000:1000 and read-only root filesystems.
- **Strict Network Blocking**: Outbound socket connections fail immediately with `Network is unreachable`.

---

## Local Development Setup

### Prerequisites

- **Node.js**: `v20.0+`
- **npm**: `v10.0+`
- **Docker Engine**: Docker Desktop running locally

### Installation & Launch

1. **Clone Repository & Install Dependencies**:

   ```bash
   git clone https://github.com/rishabhjain071130-glitch/Compiler-for-All.git
   cd Compiler-for-All
   npm install
   ```

2. **Pull Docker Toolchain Images**:

   ```bash
   docker pull gcc:12-bookworm
   docker pull eclipse-temurin:17-jdk
   docker pull python:3.10-slim
   docker pull node:18-slim
   ```

3. **Start Development Environment**:

   ```bash
   npm run dev
   ```
   - Client: `http://localhost:5173`
   - Server: `http://localhost:5000`

4. **Run Automated Test Suite**:
   ```bash
   npm run test
   npm run lint
   npm run format:check
   npm run build
   ```

---

## Production Deployment

Production deployment is automated using Docker Compose and Nginx reverse proxying:

```bash
cp .env.example .env
docker compose up --build -d
```

For detailed deployment instructions, see [docs/DEPLOYMENT.md](file:///d:/Github/Compiler-for-All/docs/DEPLOYMENT.md).

---

## License

MIT License.
