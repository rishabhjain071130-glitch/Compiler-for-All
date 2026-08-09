import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { performance } from "perf_hooks";
import { getLanguageConfig, checkToolchainAvailability } from "./config.js";
import { getFileMapping } from "./parser.js";

export interface ExecutionResult {
  status: "success" | "compilation_error" | "runtime_error" | "timeout" | "error";
  detectedLanguage: string;
  compilationStatus?: number | null;
  compilationOutput?: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number | null;
  message?: string;
}

export interface CodeRunner {
  run(code: string, stdin: string, language: string): Promise<ExecutionResult>;
}

/**
 * Escapes regex characters to safely sanitize absolute directory paths from stdout/stderr.
 */
export function sanitizeOutput(
  text: string,
  workspaceDir: string,
  _sourceFilename: string
): string {
  if (!text) return "";
  const escapedDir = workspaceDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dirPatternWithSep = new RegExp(escapedDir + "[/\\\\]", "gi");
  let sanitized = text.replace(dirPatternWithSep, "");
  const dirPattern = new RegExp(escapedDir, "gi");
  sanitized = sanitized.replace(dirPattern, ".");
  return sanitized;
}

/**
 * Resolves absolute execution paths on both Unix and Windows hosts to bypass shell wrappers.
 */
export function resolveExecutionCommand(
  commandTemplate: string[],
  workspaceDir: string
): { executable: string; args: string[] } {
  let executable = commandTemplate[0];
  const args = commandTemplate.slice(1);

  if (executable.startsWith("./") || executable.startsWith(".\\")) {
    const binaryName = executable.substring(2);
    executable = path.join(workspaceDir, binaryName);
  }

  return { executable, args };
}

/**
 * Local child process spawning execution runner.
 */
export class LocalCodeRunner implements CodeRunner {
  async run(code: string, stdin: string, language: string): Promise<ExecutionResult> {
    const config = getLanguageConfig(language);
    if (!config) {
      return {
        status: "error",
        detectedLanguage: language,
        stdout: "",
        stderr: "",
        exitCode: null,
        timeMs: null,
        message: `Unsupported language: ${language}`,
      };
    }

    // Verify toolchain availability on host first
    const toolchain = checkToolchainAvailability(language);
    if (!toolchain.available) {
      return {
        status: "error",
        detectedLanguage: config.language,
        stdout: "",
        stderr: `Execution environment unavailable. Missing executable: '${toolchain.executable}'`,
        exitCode: null,
        timeMs: null,
        message: `Toolchain unavailable: ${config.displayName} compiler/interpreter is not configured on this host.`,
      };
    }

    const mapping = getFileMapping(language, code);
    const workspaceId = crypto.randomUUID();
    const tempDir = path.join(process.cwd(), "temp");
    const workspaceDir = path.join(tempDir, workspaceId);

    // Create temporary workspace directories
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    const sourceFilename = mapping.sourceFilename;
    let outputFilename = mapping.outputFilename;

    // Windows target binary extensions mapping
    if (
      process.platform === "win32" &&
      config.compilationRequired &&
      language.toLowerCase() !== "java"
    ) {
      outputFilename = `${outputFilename}.exe`;
    }

    const sourcePath = path.join(workspaceDir, sourceFilename);
    await fs.promises.writeFile(sourcePath, code, "utf8");

    try {
      // 1. Compilation Step
      let compilationOutput = "";
      if (config.compilationRequired) {
        // Compile template substitution
        const compileArgs = config.compileCommandTemplate.map((arg) => {
          return arg.replace("[source]", sourceFilename).replace("[output]", outputFilename);
        });

        const compileProcess = spawn(compileArgs[0], compileArgs.slice(1), {
          cwd: workspaceDir,
        });

        let compileTimedOut = false;
        const compileTimeoutTimer = setTimeout(() => {
          compileTimedOut = true;
          compileProcess.kill("SIGKILL");
        }, 8000);

        await new Promise<void>((resolve) => {
          compileProcess.stdout?.on("data", (chunk) => {
            compilationOutput += chunk.toString();
          });
          compileProcess.stderr?.on("data", (chunk) => {
            compilationOutput += chunk.toString();
          });
          compileProcess.on("close", () => {
            resolve();
          });
        });

        clearTimeout(compileTimeoutTimer);

        if (compileTimedOut) {
          return {
            status: "timeout",
            detectedLanguage: config.language,
            compilationStatus: 124,
            compilationOutput: "Compilation timed out after 8 seconds.",
            stdout: "",
            stderr: "SIGTERM: Compilation terminated due to execution timeout.",
            exitCode: 124,
            timeMs: 8000,
          };
        }

        // Clean up compiler file system paths
        compilationOutput = sanitizeOutput(compilationOutput, workspaceDir, sourceFilename);

        const compileExitCode = compileProcess.exitCode;
        if (compileExitCode !== 0) {
          return {
            status: "compilation_error",
            detectedLanguage: config.language,
            compilationStatus: compileExitCode,
            compilationOutput: compilationOutput,
            stdout: "",
            stderr: "Compilation failed.",
            exitCode: compileExitCode,
            timeMs: null,
          };
        }
      }

      // 2. Execution Step
      const execTemplate = config.executionCommandTemplate.map((arg) => {
        let resolved = arg.replace("[source]", sourceFilename).replace("[output]", outputFilename);
        if (mapping.classname) {
          resolved = resolved.replace("[classname]", mapping.classname);
        }
        return resolved;
      });

      const { executable, args } = resolveExecutionCommand(execTemplate, workspaceDir);

      const runProcess = spawn(executable, args, {
        cwd: workspaceDir,
      });

      let stdoutAccumulator = "";
      let stderrAccumulator = "";
      let executionTimedOut = false;

      const runTimeoutTimer = setTimeout(() => {
        executionTimedOut = true;
        runProcess.kill("SIGKILL");
      }, 5000);

      // Async write stdin stream
      if (stdin) {
        runProcess.stdin?.write(stdin, "utf8");
      }
      runProcess.stdin?.end();

      const startTime = performance.now();

      await new Promise<void>((resolve) => {
        runProcess.stdout?.on("data", (chunk) => {
          stdoutAccumulator += chunk.toString();
        });
        runProcess.stderr?.on("data", (chunk) => {
          stderrAccumulator += chunk.toString();
        });
        runProcess.on("close", () => {
          resolve();
        });
      });

      const timeMs = Math.round(performance.now() - startTime);
      clearTimeout(runTimeoutTimer);

      if (executionTimedOut) {
        return {
          status: "timeout",
          detectedLanguage: config.language,
          compilationOutput,
          stdout: sanitizeOutput(stdoutAccumulator, workspaceDir, sourceFilename),
          stderr: "SIGTERM: Process terminated because runtime execution exceeded 5 seconds.",
          exitCode: 124,
          timeMs: 5000,
        };
      }

      const exitCode = runProcess.exitCode;
      const status = exitCode === 0 ? "success" : "runtime_error";

      return {
        status,
        detectedLanguage: config.language,
        compilationOutput,
        stdout: sanitizeOutput(stdoutAccumulator, workspaceDir, sourceFilename),
        stderr: sanitizeOutput(stderrAccumulator, workspaceDir, sourceFilename),
        exitCode,
        timeMs,
      };
    } catch (err: unknown) {
      const error = err as Error;
      return {
        status: "error",
        detectedLanguage: config.language,
        stdout: "",
        stderr: `Internal Execution Error: ${error.message}`,
        exitCode: 500,
        timeMs: null,
      };
    } finally {
      // Deterministic garbage cleanup of source files and executables
      await fs.promises.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Mock runner adapter for testing constraints or simulating absences.
 */
export class MockCodeRunner implements CodeRunner {
  private mockFailures: Record<
    string,
    "compilation_error" | "timeout" | "runtime_error" | "toolchain_unavailable"
  > = {};

  setMockFailure(
    language: string,
    type: "compilation_error" | "timeout" | "runtime_error" | "toolchain_unavailable" | null
  ) {
    const key = language.toLowerCase().replace("++", "pp");
    if (type === null) {
      delete this.mockFailures[key];
    } else {
      this.mockFailures[key] = type;
    }
  }

  async run(code: string, stdin: string, language: string): Promise<ExecutionResult> {
    const config = getLanguageConfig(language);
    if (!config) {
      return {
        status: "error",
        detectedLanguage: language,
        stdout: "",
        stderr: "",
        exitCode: null,
        timeMs: null,
        message: `Unsupported language: ${language}`,
      };
    }

    const failureType = this.mockFailures[language.toLowerCase().replace("++", "pp")];

    if (failureType === "toolchain_unavailable") {
      return {
        status: "error",
        detectedLanguage: config.language,
        stdout: "",
        stderr: "Execution environment unavailable. Missing executable: 'compiler'",
        exitCode: null,
        timeMs: null,
        message: `Toolchain unavailable: ${config.displayName} compiler/interpreter is not configured on this host.`,
      };
    }

    if (failureType === "compilation_error") {
      return {
        status: "compilation_error",
        detectedLanguage: config.language,
        compilationStatus: 1,
        compilationOutput: `src/main.${config.extension}:5:5: error: expected ';' before return`,
        stdout: "",
        stderr: "Compilation failed.",
        exitCode: 1,
        timeMs: null,
      };
    }

    if (failureType === "timeout") {
      return {
        status: "timeout",
        detectedLanguage: config.language,
        stdout: "",
        stderr: "SIGTERM: Process terminated because runtime execution exceeded 5 seconds.",
        exitCode: 124,
        timeMs: 5000,
      };
    }

    if (failureType === "runtime_error") {
      return {
        status: "runtime_error",
        detectedLanguage: config.language,
        stdout: "",
        stderr: "ZeroDivisionError: division by zero",
        exitCode: 1,
        timeMs: 15,
      };
    }

    // Default mock success output based on language
    let stdout = `Hello, World! (Simulated ${config.displayName} Run)\n`;
    if (stdin) {
      stdout += `Input received (stdin): "${stdin}"`;
    }

    return {
      status: "success",
      detectedLanguage: config.language,
      stdout,
      stderr: "",
      exitCode: 0,
      timeMs: 25,
    };
  }
}
