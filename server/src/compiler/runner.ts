import path from "path";
import { getLanguageConfig } from "./config.js";
import type { CompilerDiagnostic } from "./errorParser.js";

// ---------------------------------------------------------------------------
// ExecutionResult — structured result returned by every CodeRunner
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  status:
    | "success"
    | "compilation_error"
    | "runtime_error"
    | "timeout"
    | "runner_unavailable"
    | "resource_limit_exceeded"
    | "error";
  /** Structured error code for programmatic handling by clients. */
  errorCode?: string;
  detectedLanguage: string;
  compilationStatus?: number | null;
  compilationOutput?: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number | null;
  message?: string;
  /** Structured compiler/runtime diagnostics (line, column, severity, message). */
  diagnostics?: CompilerDiagnostic[];
  /** Beginner-friendly explanation of the error, when available. */
  friendlyMessage?: string;
}

// ---------------------------------------------------------------------------
// CodeRunner — the isolated runner abstraction boundary.
//
// ALL user code execution MUST pass through this interface.
// No implementation of this interface may invoke host-level child processes
// against untrusted user source code without a fully isolated sandbox
// (e.g. Docker/gVisor — planned for Phase 8).
// ---------------------------------------------------------------------------

export interface CodeRunner {
  run(code: string, stdin: string, language: string): Promise<ExecutionResult>;
}

// ---------------------------------------------------------------------------
// Utility: sanitizeOutput
//
// Strips absolute workspace directory paths from compiler/runtime output
// before sending data to clients. Preserved for use by Phase 8 sandbox runner.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Utility: resolveExecutionCommand
//
// Resolves relative binary paths (./main) to absolute workspace paths to
// avoid shell wrapper invocations. Preserved for Phase 8 sandbox runner.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SandboxUnavailableRunner — SAFE default runner for Phase 6/7.
//
// This runner does NOT execute any user-provided source code.
// It returns a structured runner_unavailable response for every request.
//
// A real sandboxed runner (Docker/gVisor) will replace this in Phase 8.
// This class intentionally has no child_process, fs, or exec imports.
// ---------------------------------------------------------------------------

export class SandboxUnavailableRunner implements CodeRunner {
  async run(_code: string, _stdin: string, language: string): Promise<ExecutionResult> {
    const config = getLanguageConfig(language);
    return {
      status: "runner_unavailable",
      errorCode: "RUNNER_UNAVAILABLE",
      detectedLanguage: config?.language ?? language,
      stdout: "",
      stderr: "",
      exitCode: null,
      timeMs: null,
      message:
        "The isolated execution environment is not yet available. " +
        "Code execution requires a sandboxed runner (planned for Phase 8: Sandbox Isolation). " +
        "No user code was executed on the host system.",
    };
  }
}

// ---------------------------------------------------------------------------
// MockCodeRunner — test-only runner. NEVER executes real user code.
//
// Simulates success, compilation failure, runtime failure, timeout, and
// runner_unavailable scenarios for automated tests. This class has no
// child_process or fs imports and cannot execute code on the host.
// ---------------------------------------------------------------------------

export class MockCodeRunner implements CodeRunner {
  private mockFailures: Record<
    string,
    | "compilation_error"
    | "timeout"
    | "runtime_error"
    | "toolchain_unavailable"
    | "runner_unavailable"
  > = {};

  setMockFailure(
    language: string,
    type:
      | "compilation_error"
      | "timeout"
      | "runtime_error"
      | "toolchain_unavailable"
      | "runner_unavailable"
      | null
  ) {
    const key = language.toLowerCase().replace("++", "pp");
    if (type === null) {
      delete this.mockFailures[key];
    } else {
      this.mockFailures[key] = type;
    }
  }

  async run(_code: string, stdin: string, language: string): Promise<ExecutionResult> {
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

    const failureType = this.mockFailures[language.toLowerCase().replace("++", "pp")];

    if (failureType === "runner_unavailable") {
      return {
        status: "runner_unavailable",
        errorCode: "RUNNER_UNAVAILABLE",
        detectedLanguage: config.language,
        stdout: "",
        stderr: "",
        exitCode: null,
        timeMs: null,
        message:
          "The isolated execution environment is not yet available. No user code was executed on the host system.",
      };
    }

    if (failureType === "toolchain_unavailable") {
      return {
        status: "error",
        errorCode: "TOOLCHAIN_NOT_FOUND",
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
        errorCode: "COMPILATION_ERROR",
        detectedLanguage: config.language,
        compilationStatus: 1,
        compilationOutput: `main.${config.extension}:5:5: error: expected ';' before return`,
        stdout: "",
        stderr: "Compilation failed.",
        exitCode: 1,
        timeMs: null,
        diagnostics: [
          {
            line: 5,
            column: 5,
            severity: "error" as const,
            message: "expected ';' before return",
            raw: `main.${config.extension}:5:5: error: expected ';' before return`,
          },
        ],
        friendlyMessage: undefined,
      };
    }

    if (failureType === "timeout") {
      return {
        status: "timeout",
        errorCode: "EXECUTION_TIMEOUT",
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
        errorCode: "RUNTIME_ERROR",
        detectedLanguage: config.language,
        stdout: "",
        stderr: "ZeroDivisionError: division by zero",
        exitCode: 1,
        timeMs: 15,
        diagnostics: [],
        friendlyMessage:
          "**Division by Zero**: Your code is trying to divide a number by zero, which is mathematically undefined. Check that your divisor is never zero before performing division.",
      };
    }

    // Default: simulated success. Uses config.displayName only — never executes code.
    let stdout = `Hello, World! (Simulated ${config.displayName} Run)\n`;
    if (stdin) {
      stdout += `Input received (stdin): "${stdin}"`;
    }

    return {
      status: "success",
      errorCode: undefined,
      detectedLanguage: config.language,
      stdout,
      stderr: "",
      exitCode: 0,
      timeMs: 25,
    };
  }
}
