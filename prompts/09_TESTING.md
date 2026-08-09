# Phase 9: Testing & Benchmarking

## Objective

Establish a complete testing framework covering backend endpoint integration, stress loading, concurrency limits, and security sandbox verification.

---

## Requirements

- Create a dedicated tests package or directory `tests/` at the root folder level.
- Write API Integration Tests (`tests/integration.test.ts`):
  - Verify request routing and authoritative language detection for C, C++, Java, Python, and JavaScript.
  - Verify correct compilation, run, output stream captures, and success exit codes.
- Write Sandbox Security Verification Tests (`tests/security.test.ts`):
  - Execute code trying to perform directory traversals (e.g., trying to read `/etc/passwd` or host system paths) and assert they fail.
  - Execute code attempting to ping external networks and assert execution times out or errors immediately.
  - Execute resource starvation scripts (fork bombs, memory loops) and assert resource limit indicators are returned.
- Write Stress & Concurrency Tests (`tests/stress.test.ts`):
  - Initiate 10 concurrent execution requests.
  - Assert that inputs and outputs do not bleed between requests (perfect data isolation).
  - Assert that CPU utilization stays within boundaries and no zombie containers persist.

---

## Technical Considerations

- **Docker State Verification**: Integration tests must check if Docker is running. If not, they must print warnings or gracefully skip sandbox suites, while running the local process verification tests instead.
- **Clean Test Workspaces**: Each test run must write to a separated test workspace subdirectory and clean up all temporary assets upon test teardown.

---

## Files/Components Expected

- `tests/integration.test.ts`: Routes, output validation, and payload configurations.
- `tests/security.test.ts`: Host protection and restriction compliance tests.
- `tests/stress.test.ts`: High concurrency execution streams.

---

## Acceptance Criteria

1.  Running `npm run test:e2e` executes all integration, security, and stress tests.
2.  Tests verify 100% boundary isolation: standard code works; malicious code is successfully sandboxed and terminated without crashing the host process.
3.  Concurrency tests show that 10 simultaneous runs return separate correct outputs in parallel with zero data contamination.
4.  No active processes or volumes remain after tests conclude.

---

## Things the agent must not do

- **DO NOT** run vulnerability checks directly on the host operating system without Docker isolation.
- **DO NOT** write testing files that alter project source files permanently.
