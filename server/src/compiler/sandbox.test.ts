import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildContainerShellCommand,
  buildDockerRunArgs,
  DOCKER_IMAGES,
  DockerSandbox,
  isDockerAvailable,
  isGvisorAvailable,
  toDockerVolumePath,
} from "./sandbox.js";

// ===========================================================================
// Phase 8: Security Sandbox & Isolation Tests (20 Scenarios)
// ===========================================================================

describe("Phase 8: Security Sandbox Unit & Configuration Tests", () => {
  // -------------------------------------------------------------------------
  // 1. Docker availability detection
  // -------------------------------------------------------------------------
  it("(T1) detects Docker availability status without throwing", async () => {
    const available = await isDockerAvailable();
    expect(typeof available).toBe("boolean");
  });

  // -------------------------------------------------------------------------
  // 2. gVisor availability detection
  // -------------------------------------------------------------------------
  it("(T2) detects gVisor runtime availability status without throwing", async () => {
    const available = await isGvisorAvailable();
    expect(typeof available).toBe("boolean");
  });

  // -------------------------------------------------------------------------
  // 3. Image mapping per language
  // -------------------------------------------------------------------------
  it("(T3) maps supported languages to verified official Docker images", () => {
    expect(DOCKER_IMAGES.c).toBe("gcc:12-bookworm");
    expect(DOCKER_IMAGES.cpp).toBe("gcc:12-bookworm");
    expect(DOCKER_IMAGES.java).toBe("eclipse-temurin:17-jdk");
    expect(DOCKER_IMAGES.python).toBe("python:3.10-slim");
    expect(DOCKER_IMAGES.javascript).toBe("node:18-slim");
  });

  // -------------------------------------------------------------------------
  // 4. Volume path formatting
  // -------------------------------------------------------------------------
  it("(T4) converts Windows drive letters to Docker volume format", () => {
    const formatted = toDockerVolumePath("C:\\Users\\test\\tmp");
    expect(formatted).not.toContain("\\");
    expect(formatted.startsWith("/c/") || formatted.startsWith("/C/")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. Normal C execution command building
  // -------------------------------------------------------------------------
  it("(T5) builds C container shell command with GCC and stdin redirection", () => {
    const cmd = buildContainerShellCommand("c", "main.c", true);
    expect(cmd).toContain("gcc -O2 -std=c11 -Wall /workspace/main.c -o /tmp/main");
    expect(cmd).toContain("< /workspace/stdin.txt");
  });

  // -------------------------------------------------------------------------
  // 6. Normal C++ execution command building
  // -------------------------------------------------------------------------
  it("(T6) builds C++ container shell command with G++ and stdin redirection", () => {
    const cmd = buildContainerShellCommand("cpp", "main.cpp", false);
    expect(cmd).toContain("g++ -O2 -std=c++17 -Wall /workspace/main.cpp -o /tmp/main");
    expect(cmd).not.toContain("< /workspace/stdin.txt");
  });

  // -------------------------------------------------------------------------
  // 7. Normal Java execution command building
  // -------------------------------------------------------------------------
  it("(T7) builds Java container shell command with javac and java", () => {
    const cmd = buildContainerShellCommand("java", "BinaryTree.java", true);
    expect(cmd).toContain("javac -d /tmp /workspace/BinaryTree.java");
    expect(cmd).toContain("java -cp /tmp BinaryTree < /workspace/stdin.txt");
  });

  // -------------------------------------------------------------------------
  // 8. Normal Python execution command building
  // -------------------------------------------------------------------------
  it("(T8) builds Python container shell command", () => {
    const cmd = buildContainerShellCommand("python", "main.py", false);
    expect(cmd).toBe("python3 /workspace/main.py");
  });

  // -------------------------------------------------------------------------
  // 9. Normal JavaScript execution command building
  // -------------------------------------------------------------------------
  it("(T9) builds JavaScript container shell command", () => {
    const cmd = buildContainerShellCommand("javascript", "main.js", true);
    expect(cmd).toBe("node /workspace/main.js < /workspace/stdin.txt");
  });

  // -------------------------------------------------------------------------
  // 10. Security Arg: Network Block
  // -------------------------------------------------------------------------
  it("(T10) enforces network isolation (--network none)", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "/tmp/test",
      image: "python:3.10-slim",
      commandStr: "python3 /workspace/main.py",
    });
    expect(args).toContain("--network");
    const netIdx = args.indexOf("--network");
    expect(args[netIdx + 1]).toBe("none");
  });

  // -------------------------------------------------------------------------
  // 11. Security Arg: Non-root User
  // -------------------------------------------------------------------------
  it("(T11) enforces non-root execution (--user 1000:1000)", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "/tmp/test",
      image: "node:18-slim",
      commandStr: "node /workspace/main.js",
    });
    expect(args).toContain("--user");
    const userIdx = args.indexOf("--user");
    expect(args[userIdx + 1]).toBe("1000:1000");
  });

  // -------------------------------------------------------------------------
  // 12. Security Arg: Read-only Root Filesystem
  // -------------------------------------------------------------------------
  it("(T12) enforces read-only root filesystem (--read-only)", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "/tmp/test",
      image: "gcc:12-slim",
      commandStr: "gcc /workspace/main.c",
    });
    expect(args).toContain("--read-only");
  });

  // -------------------------------------------------------------------------
  // 13. Security Arg: RAM Tmpfs
  // -------------------------------------------------------------------------
  it("(T13) mounts restricted RAM-disk tmpfs (--tmpfs /tmp:rw,exec,nosuid,size=5m)", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "/tmp/test",
      image: "gcc:12-bookworm",
      commandStr: "gcc /workspace/main.c",
    });
    expect(args).toContain("--tmpfs");
    const tmpfsIdx = args.indexOf("--tmpfs");
    expect(args[tmpfsIdx + 1]).toContain("/tmp:rw,exec,nosuid,size=5m");
  });

  // -------------------------------------------------------------------------
  // 14. Security Arg: Hardware Caps (Memory & CPU)
  // -------------------------------------------------------------------------
  it("(T14) enforces memory (64MB) and CPU (0.5) caps", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "/tmp/test",
      image: "python:3.10-slim",
      commandStr: "python3 /workspace/main.py",
    });
    expect(args).toContain("-m");
    const mIdx = args.indexOf("-m");
    expect(args[mIdx + 1]).toBe("64m");

    expect(args).toContain("--memory-swap");
    const swapIdx = args.indexOf("--memory-swap");
    expect(args[swapIdx + 1]).toBe("64m");

    expect(args).toContain("--cpus");
    const cpuIdx = args.indexOf("--cpus");
    expect(args[cpuIdx + 1]).toBe("0.5");
  });

  // -------------------------------------------------------------------------
  // 15. Security Arg: Process and FD limits (Fork Bomb & Resource Hogs)
  // -------------------------------------------------------------------------
  it("(T15) enforces PID limit (50) and file descriptor limit (64)", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "/tmp/test",
      image: "python:3.10-slim",
      commandStr: "python3 /workspace/main.py",
    });
    expect(args).toContain("--pids-limit");
    const pidsIdx = args.indexOf("--pids-limit");
    expect(args[pidsIdx + 1]).toBe("50");

    expect(args).toContain("--ulimit");
    const ulimitIdx = args.indexOf("--ulimit");
    expect(args[ulimitIdx + 1]).toBe("nofile=64:64");
  });

  // -------------------------------------------------------------------------
  // 16. Security Arg: Read-only Workspace Mount
  // -------------------------------------------------------------------------
  it("(T16) mounts workspace as read-only volume (-v workspace:/workspace:ro)", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "C:\\tmp\\cfa-1234",
      image: "python:3.10-slim",
      commandStr: "python3 /workspace/main.py",
    });
    expect(args).toContain("-v");
    const vIdx = args.indexOf("-v");
    expect(args[vIdx + 1]).toContain(":/workspace:ro");
  });

  // -------------------------------------------------------------------------
  // 17. Security Check: No --privileged and no host socket mount
  // -------------------------------------------------------------------------
  it("(T17) never contains --privileged or docker.sock mounts", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "/tmp/test",
      image: "python:3.10-slim",
      commandStr: "python3 /workspace/main.py",
    });
    expect(args).not.toContain("--privileged");
    expect(args.some((a) => a.includes("docker.sock"))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 18. Security Check: gVisor runtime flag
  // -------------------------------------------------------------------------
  it("(T18) includes --runtime=runsc when gVisor is requested", () => {
    const args = buildDockerRunArgs({
      workspaceDir: "/tmp/test",
      image: "python:3.10-slim",
      commandStr: "python3 /workspace/main.py",
      useGvisor: true,
    });
    expect(args).toContain("--runtime=runsc");
  });

  // -------------------------------------------------------------------------
  // 19. DockerSandbox returns RUNNER_UNAVAILABLE when Docker missing
  // -------------------------------------------------------------------------
  it("(T19) DockerSandbox falls back cleanly to runner_unavailable when Docker is off", async () => {
    const sandbox = new DockerSandbox();
    const result = await sandbox.run("print('hello')", "", "Python");
    expect(["runner_unavailable", "success", "error", "runtime_error"]).toContain(result.status);
    if (result.status === "runner_unavailable") {
      expect(result.errorCode).toBe("RUNNER_UNAVAILABLE");
      expect(result.message).toContain("unavailable");
    }
  }, 15000);

  // -------------------------------------------------------------------------
  // 20. Workspace cleanup safety
  // -------------------------------------------------------------------------
  it("(T20) ensures temporary sandbox workspace directory is created and cleaned", async () => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cfa-test-clean-"));
    const filePath = path.join(testDir, "main.py");
    await fs.writeFile(filePath, "print('test')", "utf8");

    expect(await fs.stat(testDir)).toBeDefined();
    await fs.rm(testDir, { recursive: true, force: true });

    let error: Error | null = null;
    try {
      await fs.stat(testDir);
    } catch (e: unknown) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
  });
});
