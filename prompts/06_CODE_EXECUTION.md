# Phase 6: Code Execution Layer

## Objective
Implement local code execution using Node.js child processes. Manage temporary workspaces, compile source codes, pipe standard input streams (`stdin`), enforce runtime timeouts, and capture execution metadata.

---

## Requirements
*   Create a workspace manager (`server/src/compiler/runner.ts`):
    *   Create a unique directory for each code run under a local `server/temp/` directory (e.g., using `crypto.randomUUID()`).
    *   Write the user's code to the target workspace folder:
        *   If the code is **Java** and a public class was parsed, name the file `[Classname].java`.
        *   If it is **Java** but no class was parsed, name it `Main.java`.
        *   For other languages, name the file `main.[ext]`.
*   Establish execution flow:
    1.  **Compilation** (for C, C++, and Java): Run compilation commands. Capture any compiler errors. Stop execution if compile fails (exit code != 0).
    2.  **Execution** (for all languages): Spawn the runner process.
*   Pipe the user-provided `stdin` buffer directly into the child process's standard input stream (`stdin.write()`), and close the stream.
*   Capture streams asynchronously:
    *   Amalgamate `stdout` and `stderr` buffers.
    *   Record the execution time in milliseconds.
*   Implement hard process timeouts:
    *   Kill compilers if compilation exceeds 8 seconds.
    *   Kill runners if execution exceeds 5 seconds.
    *   Return a standard execution status (e.g., `"timeout"`).
*   Enforce workspace cleanup:
    *   Ensure all temporary source files and compiled binaries are recursively deleted when the run completes or aborts, utilizing a `finally` code block.

---

## Technical Considerations
*   **Path Sanitization**: Ensure raw host machine paths (e.g., `C:\Users\...\server\temp\uuid\main.cpp`) are stripped from `stdout`/`stderr` before returning data. Replace them with virtual filenames (`main.cpp`).
*   **Process Spawning Safety**: Do not use shell execution wrappers (like `child_process.exec`). Use stream-based spawners (`child_process.spawn`) to guard against shell exploits.
*   **Cross-Platform Host Safety (Windows local runner)**: Since local development may run on a Windows host, the execution layer must:
    *   Detect the host platform using `process.platform === 'win32'`.
    *   When compiling C/C++ on Windows, append `.exe` to the output binary name.
    *   Execute local binaries on Windows using correct path resolution (e.g., resolving the absolute path of the generated `.exe` file rather than hardcoding Unix `./[output]`).

---

## Files/Components Expected
*   `server/src/compiler/runner.ts`: Workspace creation, child process management, execution pipeline, and garbage cleanup.
*   `server/src/routes/execute.ts`: Modified to invoke `runner.ts` and format output packets.

---

## Acceptance Criteria
1.  Writing a Python script `print(input() + " world")` with stdin value `hello` returns `hello world` inside the frontend console.
2.  Executing infinite loops (e.g., `while True: pass`) terminates after exactly 5 seconds, returning an execution error status indicating timeout.
3.  Temporary directory folders created inside `server/temp/` are successfully deleted immediately following execution.
4.  No active processes remain orphaned on the host server after timeouts occur.

---

## Things the agent must not do
*   **DO NOT** run execution commands in a virtualized container or sandbox (Docker/gVisor) yet. Keep it running locally.
*   **DO NOT** write output files directly in the root project folder. Keep everything constrained inside `server/temp/`.
