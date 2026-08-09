# Phase 8: Sandbox Security Isolation

## Objective
Harden the execution layer by routing compilation and execution commands through resource-constrained Docker containers utilizing the gVisor (`runsc`) security runtime.

---

## Requirements
*   Create a Docker sandbox manager `server/src/compiler/sandbox.ts`:
    *   Interface with Docker CLI by spawning `docker run` commands dynamically.
    *   Use public, lightweight runner images: `gcc:12-slim` (C/C++), `openjdk:17-slim` (Java), `python:3.10-slim` (Python), and `node:18-slim` (JS).
*   Enforce security constraints:
    *   **Isolation Runtime**: Add `--runtime=runsc` to use gVisor (if available on the host, fallback gracefully with a warning to default docker run in local dev).
    *   **Resource Caps**: Limit memory swap (`-m 64m --memory-swap 64m`) and CPU cores (`--cpus="0.5"`).
    *   **Network block**: Apply `--network none` to prevent internet calls.
    *   **Privilege Drop**: Run container files as unprivileged user `--user 1000:1000`.
    *   **Storage Access**: Mount temporary workspace directories as read-only volumes (`-v [host_path]:[container_path]:ro`). Mount `/tmp` as a temporary RAM-disk (`--tmpfs /tmp:rw,noexec,nosuid,size=5m`).
*   Handle container exits:
    *   Detect Out-of-Memory crashes (OOM, usually returns exit code `137`) and map them to the error payload with status `"resource_limit_exceeded"`.
    *   Distinguish container setup failures (Docker issues) from program crashes.

---

## Technical Considerations
*   **Path Mapping (Windows host)**: When running Docker Desktop on Windows, handle path conversions (e.g. translating `C:\path` to `/c/path` or using relative Docker volumes) to guarantee correct file mounting.
*   **Container Cache**: Implement a warm-up step or check that pulls missing runtime images on backend start.

---

## Files/Components Expected
*   `server/src/compiler/sandbox.ts`: Docker argument assembler, execution handler, stream logger, and exit code mapper.
*   `server/src/compiler/runner.ts`: Integrate sandbox layer as the authoritative execution engine, maintaining local child processes as a fallback option only.

---

## Acceptance Criteria
1.  Running a Python program that attempts to import `socket` and connect to an IP address fails (throws socket errors due to `--network none`).
2.  Executing a C script that writes to `/root/test.txt` fails with a "Read-only file system" error.
3.  A memory-leak script (creating objects in an infinite loop) is terminated by Docker, and the API returns a `status: "resource_limit_exceeded"` with a friendly "Out of Memory" alert.
4.  Standard code executions continue to operate correctly, piping stdin/stdout streams through the Docker sandbox container transparently.

---

## Things the agent must not do
*   **DO NOT** run containers in `--privileged` mode or expose host network configurations (`--net=host`).
*   **DO NOT** mount root host directories (`C:\` or `/`) inside the container volumes. Keep mounts restricted strictly to individual random temp execution folders.
*   **DO NOT** leave dangling containers on the host. Always add the `--rm` flag to the Docker run parameters to ensure container garbage collection.
