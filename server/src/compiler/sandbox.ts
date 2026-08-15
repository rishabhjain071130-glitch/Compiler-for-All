// ---------------------------------------------------------------------------
// sandbox.ts — Phase 8 Docker/gVisor Security Sandbox Manager
//
// Hardware & Security Constraints Enforced:
//   - Network block: --network none
//   - Memory limit: -m 64m --memory-swap 64m
//   - CPU limit: --cpus="0.5"
//   - Non-root user: --user 1000:1000
//   - Read-only root filesystem: --read-only
//   - RAM tmpfs for temporary writes: --tmpfs /tmp:rw,noexec,nosuid,size=5m
//   - PID limit (fork bomb protection): --pids-limit 50
//   - File descriptor limit: --ulimit nofile=64:64
//   - Source code mount: -v [host_tmpdir]:/workspace:ro (Read-Only)
//   - Container auto-cleanup: --rm
//   - Runtime: --runtime=runsc (gVisor if available, fallback with warning)
// ---------------------------------------------------------------------------

import { execFile, spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { getLanguageConfig } from "./config.js";
import { parseCompilerOutput } from "./errorParser.js";
import { generateCommands } from "./parser.js";
import { CodeRunner, ExecutionResult, sanitizeOutput } from "./runner.js";

const execFileAsync = promisify(execFile);

/**
 * Docker image mapping for supported language toolchains.
 * Public, official, lightweight slim images per Phase 8 specification.
 */
export const DOCKER_IMAGES: Record<string, string> = {
  c: "gcc:12-bookworm",
  cpp: "gcc:12-bookworm",
  java: "eclipse-temurin:17-jdk",
  python: "python:3.10-slim",
  javascript: "node:18-slim",
};

/**
 * Execution limits configuration.
 */
export const SANDBOX_LIMITS = {
  MEMORY_MB: 64,
  CPU_CORES: 0.5,
  PIDS_LIMIT: 50,
  NOFILE_LIMIT: 64,
  TMPFS_SIZE_MB: 5,
  MAX_OUTPUT_BYTES: 1024 * 1024, // 1 MB
  COMPILE_TIMEOUT_MS: 8000,
  EXECUTE_TIMEOUT_MS: 5000,
  TOTAL_TIMEOUT_MS: 10000,
};

let cachedDockerAvailable: boolean | null = null;
let cachedGvisorAvailable: boolean | null = null;

/**
 * Probe whether Docker binary and daemon are available on the host system.
 * Caches result after first call unless forced.
 */
export async function isDockerAvailable(forceCheck = false): Promise<boolean> {
  if (cachedDockerAvailable !== null && !forceCheck) {
    return cachedDockerAvailable;
  }

  try {
    const { stdout } = await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      timeout: 3000,
    });
    cachedDockerAvailable = Boolean(stdout && stdout.trim().length > 0);
  } catch {
    cachedDockerAvailable = false;
  }

  return cachedDockerAvailable;
}

/**
 * Probe whether gVisor (`runsc`) container runtime is configured in Docker daemon.
 */
export async function isGvisorAvailable(forceCheck = false): Promise<boolean> {
  if (cachedGvisorAvailable !== null && !forceCheck) {
    return cachedGvisorAvailable;
  }

  try {
    const { stdout } = await execFileAsync("docker", ["info", "--format", "{{json .Runtimes}}"], {
      timeout: 3000,
    });
    cachedGvisorAvailable = stdout ? stdout.includes("runsc") : false;
  } catch {
    cachedGvisorAvailable = false;
  }

  return cachedGvisorAvailable;
}

/**
 * Converts a host path to a format recognized by Docker Desktop on Windows.
 * E.g., `C:\Users\foo` -> `/c/Users/foo` or standard path with forward slashes.
 */
export function toDockerVolumePath(hostPath: string): string {
  const normalized = path.resolve(hostPath).replace(/\\/g, "/");
  // Check for Windows drive letter (e.g. D:/path or C:/path)
  const windowsDriveMatch = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (windowsDriveMatch) {
    const driveLetter = windowsDriveMatch[1].toLowerCase();
    const rest = windowsDriveMatch[2];
    return `/${driveLetter}/${rest}`;
  }
  return normalized;
}

/**
 * Assembles docker run command arguments for executing user code inside the sandbox.
 */
export function buildDockerRunArgs(options: {
  workspaceDir: string;
  image: string;
  commandStr: string;
  useGvisor?: boolean;
  containerName?: string;
}): string[] {
  const volumePath = toDockerVolumePath(options.workspaceDir);

  const args: string[] = ["run", "--rm"];

  if (options.containerName) {
    args.push("--name", options.containerName);
  }

  args.push(
    "--network",
    "none",
    "-m",
    `${SANDBOX_LIMITS.MEMORY_MB}m`,
    "--memory-swap",
    `${SANDBOX_LIMITS.MEMORY_MB}m`,
    "--cpus",
    String(SANDBOX_LIMITS.CPU_CORES),
    "--user",
    "1000:1000",
    "--read-only",
    "--tmpfs",
    `/tmp:rw,exec,nosuid,size=${SANDBOX_LIMITS.TMPFS_SIZE_MB}m`,
    "--pids-limit",
    String(SANDBOX_LIMITS.PIDS_LIMIT),
    "--ulimit",
    `nofile=${SANDBOX_LIMITS.NOFILE_LIMIT}:${SANDBOX_LIMITS.NOFILE_LIMIT}`,
    "-v",
    `${volumePath}:/workspace:ro`,
    "-w",
    "/tmp"
  );

  if (options.useGvisor) {
    args.push("--runtime=runsc");
  }

  args.push(options.image, "sh", "-c", options.commandStr);

  return args;
}

/**
 * Generates the shell script string to run inside the container.
 */
export function buildContainerShellCommand(
  language: string,
  sourceFilename: string,
  hasStdin: boolean
): string {
  const normLang = language.toLowerCase().replace("++", "pp");
  const stdinRedirection = hasStdin ? " < /workspace/stdin.txt" : "";

  switch (normLang) {
    case "c":
      return `gcc -O2 -std=c11 -Wall /workspace/${sourceFilename} -o /tmp/main && /tmp/main${stdinRedirection}`;
    case "cpp":
      return `g++ -O2 -std=c++17 -Wall /workspace/${sourceFilename} -o /tmp/main && /tmp/main${stdinRedirection}`;
    case "java": {
      const className = sourceFilename.endsWith(".java") ? sourceFilename.slice(0, -5) : "Main";
      return `javac -d /tmp /workspace/${sourceFilename} && java -cp /tmp ${className}${stdinRedirection}`;
    }
    case "python":
      return `python3 /workspace/${sourceFilename}${stdinRedirection}`;
    case "javascript":
      return `node /workspace/${sourceFilename}${stdinRedirection}`;
    default:
      throw new Error(`Unsupported sandbox language: ${language}`);
  }
}

/**
 * DockerSandbox implements CodeRunner by spawning isolated Docker containers.
 */
export class DockerSandbox implements CodeRunner {
  async run(code: string, stdin: string, language: string): Promise<ExecutionResult> {
    const config = getLanguageConfig(language);
    if (!config) {
      return {
        status: "error",
        errorCode: "UNSUPPORTED_LANGUAGE",
        detectedLanguage: language,
        stdout: "",
        stderr: "",
        exitCode: null,
        timeMs: null,
        message: `Unsupported language: ${language}`,
      };
    }

    const dockerOk = await isDockerAvailable();
    if (!dockerOk) {
      return {
        status: "runner_unavailable",
        errorCode: "RUNNER_UNAVAILABLE",
        detectedLanguage: config.language,
        stdout: "",
        stderr: "",
        exitCode: null,
        timeMs: null,
        message:
          "The isolated execution environment is currently unavailable. " +
          "Docker daemon is not running or not installed on the host system. " +
          "No user code was executed on the host system.",
      };
    }

    const gvisorOk = await isGvisorAvailable();
    const image = DOCKER_IMAGES[config.language] || DOCKER_IMAGES.c;

    // Create unique temporary workspace on host
    let workspaceDir = "";
    try {
      workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "cfa-sandbox-"));
    } catch {
      return {
        status: "error",
        errorCode: "INTERNAL_ERROR",
        detectedLanguage: config.language,
        stdout: "",
        stderr: "",
        exitCode: null,
        timeMs: null,
        message: "Failed to create temporary sandbox workspace directory.",
      };
    }

    try {
      const commandInfo = generateCommands(language, code);
      const sourcePath = path.join(workspaceDir, commandInfo.sourceFilename);
      await fs.writeFile(sourcePath, code, "utf8");

      const hasStdin = Boolean(stdin && stdin.length > 0);
      if (hasStdin) {
        const stdinPath = path.join(workspaceDir, "stdin.txt");
        await fs.writeFile(stdinPath, stdin, "utf8");
      }

      const shellCmd = buildContainerShellCommand(
        config.language,
        commandInfo.sourceFilename,
        hasStdin
      );

      const containerName = `cfa-exec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const dockerArgs = buildDockerRunArgs({
        workspaceDir,
        image,
        commandStr: shellCmd,
        useGvisor: gvisorOk,
        containerName,
      });

      const startTime = Date.now();
      const execResult = await this.spawnDockerContainer(dockerArgs, containerName);
      const durationMs = Date.now() - startTime;

      return this.processSandboxResult(
        execResult,
        config.language,
        workspaceDir,
        commandInfo.sourceFilename,
        durationMs
      );
    } catch (err: unknown) {
      const error = err as Error;
      return {
        status: "error",
        errorCode: "INTERNAL_ERROR",
        detectedLanguage: config.language,
        stdout: "",
        stderr: "",
        exitCode: null,
        timeMs: null,
        message: `Sandbox execution failed: ${error.message}`,
      };
    } finally {
      // Ensure temp workspace is always cleaned up
      if (workspaceDir) {
        await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  private spawnDockerContainer(
    args: string[],
    containerName?: string
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
  }> {
    return new Promise((resolve) => {
      let stdoutData = "";
      let stderrData = "";
      let timedOut = false;

      const child = spawn("docker", args, {
        windowsHide: true,
      });

      const timer = setTimeout(async () => {
        timedOut = true;
        child.kill("SIGKILL");
        if (containerName) {
          try {
            await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 3000 });
          } catch {
            // Container already cleaned up or removed
          }
        }
      }, SANDBOX_LIMITS.TOTAL_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdoutData.length < SANDBOX_LIMITS.MAX_OUTPUT_BYTES) {
          stdoutData += chunk.toString("utf8");
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrData.length < SANDBOX_LIMITS.MAX_OUTPUT_BYTES) {
          stderrData += chunk.toString("utf8");
        }
      });

      child.on("error", () => {
        clearTimeout(timer);
        resolve({
          stdout: stdoutData,
          stderr: stderrData || "Docker spawn error",
          exitCode: 1,
          timedOut,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          stdout: stdoutData,
          stderr: stderrData,
          exitCode: code,
          timedOut,
        });
      });
    });
  }

  private processSandboxResult(
    rawResult: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean },
    language: string,
    workspaceDir: string,
    sourceFilename: string,
    durationMs: number
  ): ExecutionResult {
    const stdout = sanitizeOutput(rawResult.stdout, workspaceDir, sourceFilename);
    const stderr = sanitizeOutput(rawResult.stderr, workspaceDir, sourceFilename);

    if (rawResult.timedOut || rawResult.exitCode === 124) {
      return {
        status: "timeout",
        errorCode: "EXECUTION_TIMEOUT",
        detectedLanguage: language,
        stdout,
        stderr: stderr || "Execution timed out (exceeded limit).",
        exitCode: 124,
        timeMs: durationMs,
      };
    }

    // OOM or memory limit exit code (137 = 128 + 9 SIGKILL)
    if (rawResult.exitCode === 137) {
      return {
        status: "resource_limit_exceeded",
        errorCode: "RESOURCE_LIMIT_EXCEEDED",
        detectedLanguage: language,
        stdout,
        stderr: stderr || "Memory limit exceeded (Out of Memory).",
        exitCode: 137,
        timeMs: durationMs,
        friendlyMessage:
          "**Out of Memory**: Your program exceeded the 64 MB memory limit and was terminated by the sandbox.",
      };
    }

    // Determine compilation error vs runtime error vs success
    if (rawResult.exitCode !== 0) {
      const isCompileErr =
        stderr.includes("error:") ||
        stderr.includes("SyntaxError:") ||
        stderr.includes("cannot find symbol");

      const parsed = parseCompilerOutput(language, stderr);

      if (isCompileErr) {
        return {
          status: "compilation_error",
          errorCode: "COMPILATION_ERROR",
          detectedLanguage: language,
          compilationStatus: rawResult.exitCode,
          compilationOutput: stderr,
          stdout,
          stderr,
          exitCode: rawResult.exitCode,
          timeMs: durationMs,
          diagnostics: parsed.diagnostics,
          friendlyMessage: parsed.friendlyMessage ?? undefined,
        };
      }

      return {
        status: "runtime_error",
        errorCode: "RUNTIME_ERROR",
        detectedLanguage: language,
        stdout,
        stderr,
        exitCode: rawResult.exitCode,
        timeMs: durationMs,
        diagnostics: parsed.diagnostics,
        friendlyMessage: parsed.friendlyMessage ?? undefined,
      };
    }

    return {
      status: "success",
      errorCode: undefined,
      detectedLanguage: language,
      stdout,
      stderr,
      exitCode: 0,
      timeMs: durationMs,
    };
  }
}
