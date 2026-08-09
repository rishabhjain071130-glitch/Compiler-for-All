# Master Prompt & Project Guidelines: Compiler for All

This file contains the permanent project rules, engineering guidelines, and architectural principles for **Compiler for All**. Every agent executing a phase of this project must read and adhere to these guidelines.

---

## 1. Core Architectural Principles

- **Secure Execution Sandbox First**: Raw user code must **never** be executed directly on the host system. All compilations and interpretations must run inside isolated Docker containers running with gVisor (`runsc`) as the runtime engine.
- **Zero-Config Simplicity**: The frontend must prioritize a zero-config, low-friction environment. The compiler detects the language. The user clicks run.
- **Decoupled Language Detection**: Language detection logic should be bundled into a shareable TypeScript module, usable on the client (speculative styling changes) and the backend (definitive execution routing).
- **Responsive Glassmorphic Design**: The visual styling must look premium, modern, and dark-themed. Custom CSS custom properties (variables) should drive colors and spacing rather than ad-hoc inline styles.

---

## 2. Engineering & Code Guidelines

### 2.1 Backend (Node.js & TypeScript)

- **Module System**: ECMAScript Modules (`import`/`export` syntax, not `require` in new files).
- **Typing**: Strict TypeScript. Avoid using `any` type casts. Always define interfaces for request payloads, compiler settings, and engine logs.
- **Concurrency**: Avoid blocking operations. Use asynchronous child process executions (`execa` or native `child_process.execFile` wrapped in Promises) to run sandboxed commands.

### 2.2 Frontend (React, Vite & TypeScript)

- **Layout**: CSS flexbox/grid layout. Keep it responsive (workable on mobile views, although optimized for desktop).
- **State Management**: Standard React State/Context hooks. Minimize global store overhead; pass state down cleanly or use lightweight custom hooks.
- **Monaco Editor**: Wrap Monaco inside a custom React wrapper, ensuring correct lifecycle cleanup to prevent memory leaks.

---

## 3. Sandboxing & Safety Rules

- **Hardware Quotas**:
  - Max RAM: 64MB (enforced via docker `-m 64m`).
  - Max CPU: 0.5 Cores (enforced via docker `--cpus="0.5"`).
  - Timeout: 5 seconds runtime execution; 8 seconds compile-time.
- **System Call Isolation**: Docker must run with the gVisor sandbox container runtime.
- **Network Disable**: Containers must have no network bridge configurations (`--network none`).
- **No root Execution**: Containers must run scripts under an unprivileged user (UID/GID 1000).

---

## 4. Error Routing & Formatting

- **Execution Response Schemas**:
  All executions must return standardized JSON payloads:
  ```typescript
  interface CompilerSuccessResponse {
    status: "success";
    detectedLanguage: string; // The authoritatively detected language ID
    stdout: string; // Standard output buffer from execution
    stderr: string; // Standard error buffer (compiler warnings, etc.)
    exitCode: number; // Process exit code (normally 0 for success)
    timeMs: number; // Execution duration in milliseconds
  }

  interface CompilerErrorResponse {
    status: "compilation_error" | "runtime_error" | "resource_limit_exceeded";
    message: string; // Raw compiler message or high-level summary
    friendlyMessage?: string; // Beginner-friendly translation of the error
    rawError: string; // Original stderr from compiler/interpreter
    severity: "error" | "warning"; // Severity level of the error
    lineNum?: number; // Extracted 1-indexed line number where error occurred
    columnNum?: number; // Extracted 1-indexed column number (if available)
  }
  ```
- **Regex Extraction**: Every compiler/interpreter stderr must be parsed at runtime to extract the error's line and column numbers. The UI must highlight these lines inside Monaco Editor.
