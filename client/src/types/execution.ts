// ---------------------------------------------------------------------------
// execution.ts — shared frontend types for execution results and diagnostics
//
// This file is the single source of truth for execution-related types on the
// client side, preventing duplication between App.tsx, Console.tsx, and
// EditorPane.tsx.
// ---------------------------------------------------------------------------

/**
 * All possible execution status values.
 * Matches the backend ExecutionResult.status union.
 */
export type ExecutionStatus =
  | "success"
  | "compilation_error"
  | "runtime_error"
  | "resource_limit_exceeded"
  | "timeout"
  | "runner_unavailable"
  | "error"
  | null;

/**
 * A single structured diagnostic from the compiler/interpreter.
 * Line and column are 1-indexed when available.
 */
export interface DiagnosticMarker {
  line: number | null;
  column: number | null;
  severity: "error" | "warning";
  message: string;
  raw?: string;
}

/**
 * Structured result returned by the /api/execute endpoint and
 * stored in App-level state.
 */
export interface ExecutionResult {
  status: ExecutionStatus;
  errorCode?: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number | null;
  compilationOutput?: string;
  message?: string;
  /** Structured diagnostics parsed from compiler/runtime output */
  diagnostics?: DiagnosticMarker[];
  /** Beginner-friendly explanation of the error, when available */
  friendlyMessage?: string | null;
}

// ---------------------------------------------------------------------------
// Execution state labels — maps ExecutionStatus to a display string.
// Used in the ControlBar and Console for consistent status communication.
// ---------------------------------------------------------------------------

export const EXECUTION_STATE_LABELS: Record<NonNullable<ExecutionStatus>, string> = {
  success: "Completed",
  compilation_error: "Compilation Failed",
  runtime_error: "Runtime Failed",
  resource_limit_exceeded: "Resource Limit Exceeded",
  timeout: "Timeout",
  runner_unavailable: "Sandbox Unavailable",
  error: "Error",
};

// ---------------------------------------------------------------------------
// Stable error code strings — mirrors ErrorCode from server/errorParser.ts.
// Kept in sync manually; Phase 9 testing validates the mapping end-to-end.
// ---------------------------------------------------------------------------

export const ClientErrorCode = {
  LANGUAGE_NOT_DETECTED: "LANGUAGE_NOT_DETECTED",
  UNSUPPORTED_LANGUAGE: "UNSUPPORTED_LANGUAGE",
  INVALID_REQUEST: "INVALID_REQUEST",
  CODE_TOO_LARGE: "CODE_TOO_LARGE",
  STDIN_TOO_LARGE: "STDIN_TOO_LARGE",
  TOOLCHAIN_NOT_FOUND: "TOOLCHAIN_NOT_FOUND",
  COMPILATION_ERROR: "COMPILATION_ERROR",
  RUNTIME_ERROR: "RUNTIME_ERROR",
  TIMEOUT: "TIMEOUT",
  RESOURCE_LIMIT: "RESOURCE_LIMIT",
  RUNNER_UNAVAILABLE: "RUNNER_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ClientErrorCodeType = (typeof ClientErrorCode)[keyof typeof ClientErrorCode];
