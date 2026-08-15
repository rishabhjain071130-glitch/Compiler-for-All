// ---------------------------------------------------------------------------
// errorParser.ts — Phase 7 centralized error model
//
// Provides:
//   - Stable error code constants
//   - Compiler diagnostic extraction (GCC/G++, Java, Python, Node.js)
//   - Friendly error translation map for common runtime/compiler errors
//   - Path sanitization helper (delegates to sanitizeOutput in runner.ts)
//
// Security: NEVER include stack traces, host paths, env vars, credentials,
// executable paths, or internal implementation details in any exported value.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Error Codes — stable string constants used by backend and frontend
// ---------------------------------------------------------------------------

export const ErrorCode = {
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
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---------------------------------------------------------------------------
// CompilerDiagnostic — a single extracted compiler/interpreter message
// ---------------------------------------------------------------------------

export interface CompilerDiagnostic {
  /** 1-indexed line number, or null if not extractable */
  line: number | null;
  /** 1-indexed column number, or null if not extractable */
  column: number | null;
  severity: "error" | "warning";
  /** Sanitized message text (no host paths) */
  message: string;
  /** The original raw line from the compiler output */
  raw: string;
}

// ---------------------------------------------------------------------------
// Regex patterns — one per language family
// Each pattern is a linear, non-backtracking regex to prevent ReDoS.
// ---------------------------------------------------------------------------

/**
 * GCC / G++ error format:
 *   main.c:5:10: error: expected ';' before 'return'
 *   main.cpp:3:1: warning: unused variable 'x'
 */
const GCC_PATTERN = /(?:main\.c(?:pp)?):(\d{1,6}):(\d{1,6}):\s+(error|warning):\s+(.+)/gi;

/**
 * Java compiler (javac) error format:
 *   Main.java:10: error: ';' expected
 *   BinarySearch.java:4: error: cannot find symbol
 */
const JAVA_PATTERN = /([A-Za-z0-9_]+\.java):(\d{1,6}):\s+error:\s+(.+)/gi;

/**
 * Python traceback format:
 *   File "main.py", line 7
 *     x = 1/0
 * Followed by an exception name on a subsequent line.
 */
const PYTHON_FILE_PATTERN = /File\s+["']main\.py["'],\s+line\s+(\d{1,6})/gi;
const PYTHON_EXCEPTION_PATTERN =
  /^([A-Za-z][A-Za-z0-9]*(?:Error|Exception|Warning|Fault|Interrupt|Stop|Exit)):/m;

/**
 * Node.js stack trace format:
 *   main.js:12:5
 *   main.js:3
 */
const NODEJS_PATTERN = /main\.js:(\d{1,6})(?::(\d{1,6}))?/gi;

// ---------------------------------------------------------------------------
// Friendly translation map — maps well-known error names to explanations.
// Keys are lowercase for case-insensitive matching.
// ---------------------------------------------------------------------------

interface FriendlyTranslation {
  title: string;
  explanation: string;
}

const FRIENDLY_MAP: Array<{ pattern: RegExp; translation: FriendlyTranslation }> = [
  {
    pattern: /sigsegv|segmentation\s+fault/i,
    translation: {
      title: "Segmentation Fault",
      explanation:
        "Your program tried to access a memory location it does not own. " +
        "Common causes: out-of-bounds array access, dereferencing a null or uninitialized pointer.",
    },
  },
  {
    pattern: /zerodivisionerror|division\s+by\s+zero|divide\s+by\s+zero/i,
    translation: {
      title: "Division by Zero",
      explanation:
        "Your code is trying to divide a number by zero, which is mathematically undefined. " +
        "Check that your divisor is never zero before performing division.",
    },
  },
  {
    pattern: /nullpointerexception/i,
    translation: {
      title: "Null Reference Error",
      explanation:
        "Your code tried to use an object reference that points to nothing (null). " +
        "Make sure to instantiate objects before calling methods or accessing fields on them.",
    },
  },
  {
    pattern: /indexoutofboundsexception|arrayindexoutofbounds/i,
    translation: {
      title: "Index Out of Bounds",
      explanation:
        "You tried to access an element in an array or list using an index that is either " +
        "negative or greater than or equal to the collection's size. " +
        "Verify that your loop bounds and indices are within the valid range.",
    },
  },
  {
    pattern: /nameerror:\s+name\s+['"]([^'"]+)['"]\s+is\s+not\s+defined/i,
    translation: {
      title: "Name Not Defined",
      explanation:
        "Your code references a variable or function name that has not been defined yet. " +
        "Check for typos, or make sure the variable is declared before it is used.",
    },
  },
  {
    pattern: /typeerror/i,
    translation: {
      title: "Type Error",
      explanation:
        "Your code attempted an operation on a value of the wrong type. " +
        "For example, adding a string to a number without conversion. " +
        "Check that the data types match the operation you are performing.",
    },
  },
  {
    pattern: /syntaxerror/i,
    translation: {
      title: "Syntax Error",
      explanation:
        "The interpreter found code that does not follow the language's grammar rules. " +
        "Common causes: missing colons, mismatched parentheses, incorrect indentation, or stray characters.",
    },
  },
  {
    pattern: /stackoverflow|stack overflow/i,
    translation: {
      title: "Stack Overflow",
      explanation:
        "Your program's call stack has exceeded its maximum size. " +
        "This usually happens with recursive functions that do not have a proper base case " +
        "or call themselves too many times.",
    },
  },
  {
    pattern: /outofmemoryerror|out\s+of\s+memory/i,
    translation: {
      title: "Out of Memory",
      explanation:
        "Your program tried to allocate more memory than is available. " +
        "Check for memory leaks or very large data structures.",
    },
  },
  {
    pattern: /classnotfoundexception|could\s+not\s+find\s+or\s+load\s+main\s+class/i,
    translation: {
      title: "Class Not Found",
      explanation:
        "Java could not locate the class file to run. " +
        "Make sure the class name in your code matches the filename exactly (Java is case-sensitive).",
    },
  },
];

// ---------------------------------------------------------------------------
// parseGccOutput — extract diagnostics from GCC/G++ stderr
// ---------------------------------------------------------------------------

function parseGccOutput(raw: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(GCC_PATTERN.source, "gi");

  while ((match = pattern.exec(raw)) !== null) {
    diagnostics.push({
      line: parseInt(match[1], 10),
      column: parseInt(match[2], 10),
      severity: match[3].toLowerCase() === "warning" ? "warning" : "error",
      message: match[4].trim(),
      raw: match[0],
    });
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// parseJavaOutput — extract diagnostics from javac stderr
// ---------------------------------------------------------------------------

function parseJavaOutput(raw: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(JAVA_PATTERN.source, "gi");

  while ((match = pattern.exec(raw)) !== null) {
    diagnostics.push({
      line: parseInt(match[2], 10),
      column: null, // javac does not always report column
      severity: "error",
      message: match[3].trim(),
      raw: match[0],
    });
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// parsePythonOutput — extract location from Python traceback
// ---------------------------------------------------------------------------

function parsePythonOutput(raw: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  let match: RegExpExecArray | null;
  const filePattern = new RegExp(PYTHON_FILE_PATTERN.source, "gi");

  // Python tracebacks can have multiple "File ... line ..." entries.
  // We collect the last one (innermost frame) as the primary error location.
  const locations: Array<{ line: number }> = [];
  while ((match = filePattern.exec(raw)) !== null) {
    locations.push({ line: parseInt(match[1], 10) });
  }

  if (locations.length === 0) return diagnostics;

  const lastLocation = locations[locations.length - 1];

  // Extract exception name for the message
  const exceptionMatch = PYTHON_EXCEPTION_PATTERN.exec(raw);
  const message = exceptionMatch ? exceptionMatch[0].trim() : "Runtime error";

  diagnostics.push({
    line: lastLocation.line,
    column: null,
    severity: "error",
    message,
    raw: raw.slice(0, 200), // truncate very long tracebacks
  });

  return diagnostics;
}

// ---------------------------------------------------------------------------
// parseNodeOutput — extract location from Node.js stack traces
// ---------------------------------------------------------------------------

function parseNodeOutput(raw: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const pattern = new RegExp(NODEJS_PATTERN.source, "gi");

  // Take first match only (top of the stack)
  const match = pattern.exec(raw);
  if (match) {
    diagnostics.push({
      line: parseInt(match[1], 10),
      column: match[2] ? parseInt(match[2], 10) : null,
      severity: "error",
      message: raw.split("\n")[0]?.trim() || "Runtime error",
      raw: match[0],
    });
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// parseCompilerOutput — main entry point
//
// Dispatches to the correct language parser and returns structured diagnostics.
// Never throws. If parsing fails, returns an empty diagnostics array.
// The caller always has access to the raw string for display.
// ---------------------------------------------------------------------------

export function parseCompilerOutput(
  language: string,
  raw: string
): { diagnostics: CompilerDiagnostic[]; friendlyMessage: string | null } {
  if (!raw || !raw.trim()) {
    return { diagnostics: [], friendlyMessage: null };
  }

  const lang = language.toLowerCase().replace("++", "pp");
  let diagnostics: CompilerDiagnostic[] = [];

  try {
    if (lang === "c" || lang === "cpp") {
      diagnostics = parseGccOutput(raw);
    } else if (lang === "java") {
      diagnostics = parseJavaOutput(raw);
    } else if (lang === "python") {
      diagnostics = parsePythonOutput(raw);
    } else if (lang === "javascript") {
      diagnostics = parseNodeOutput(raw);
    }
  } catch {
    // Never fail execution because the error parser failed.
    diagnostics = [];
  }

  const friendlyMessage = getFriendlyMessage(raw);

  return { diagnostics, friendlyMessage };
}

// ---------------------------------------------------------------------------
// getFriendlyMessage — maps raw error text to a human-readable explanation.
// Returns null if no match found in the translation table.
// ---------------------------------------------------------------------------

export function getFriendlyMessage(stderr: string): string | null {
  if (!stderr) return null;

  for (const entry of FRIENDLY_MAP) {
    if (entry.pattern.test(stderr)) {
      return `**${entry.translation.title}**: ${entry.translation.explanation}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// stripSensitivePaths — remove common sensitive path prefixes from text.
//
// Used when a workspace directory path is not available (e.g. pure unit tests).
// For production use, prefer sanitizeOutput() from runner.ts which uses the
// actual workspace directory for precise removal.
// ---------------------------------------------------------------------------

export function stripSensitivePaths(text: string): string {
  if (!text) return "";
  // Remove Unix-style temp paths
  let sanitized = text.replace(/\/(?:tmp|var\/folders|home\/[^/]+)[^\s:"]*/g, "[path]");
  // Remove Windows-style temp paths
  sanitized = sanitized.replace(/[A-Za-z]:\\(?:Users|Temp|Windows|tmp)[^\s:"']*/g, "[path]");
  return sanitized;
}
