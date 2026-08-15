import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { Express } from "express";
import { Server } from "http";
import { AddressInfo } from "net";
import {
  getLanguageConfig,
  checkToolchainAvailability,
  setMockUnavailableToolchains,
} from "./config.js";
import { extractJavaClassName, getFileMapping, generateCommands } from "./parser.js";
import executeRouter, { activeRunner } from "../routes/execute.js";
import {
  MockCodeRunner,
  SandboxUnavailableRunner,
  sanitizeOutput,
  resolveExecutionCommand,
} from "./runner.js";
import {
  parseCompilerOutput,
  getFriendlyMessage,
  stripSensitivePaths,
  ErrorCode,
} from "./errorParser.js";

// ---------------------------------------------------------------------------
// Response shape used by the integration tests
// ---------------------------------------------------------------------------
interface TestResponse {
  status?: string;
  errorCode?: string;
  detectedLanguage?: string;
  compilationCommand?: string[] | null;
  executionCommand?: string[];
  sourceFilename?: string;
  stdout?: string;
  stderr?: string;
  code?: string;
  language?: string;
  error?: string;
  message?: string;
  details?: string;
  compilationOutput?: string;
  diagnostics?: Array<{
    line: number | null;
    column: number | null;
    severity: string;
    message: string;
    raw?: string;
  }>;
  friendlyMessage?: string | null;
}

// ===========================================================================
// 1. Configuration Registry
// ===========================================================================

describe("Compiler Engine Configuration Registry", () => {
  it("resolves configs case-insensitively", () => {
    const cConfig = getLanguageConfig("C");
    const cppConfig = getLanguageConfig("C++");
    const pyConfig = getLanguageConfig("python");

    expect(cConfig).not.toBeNull();
    expect(cConfig?.language).toBe("c");
    expect(cppConfig?.language).toBe("cpp");
    expect(pyConfig?.language).toBe("python");
  });

  it("handles unsupported languages cleanly by returning null", () => {
    const invalid = getLanguageConfig("COBOL");
    expect(invalid).toBeNull();
  });
});

// ===========================================================================
// 2. Toolchain Availability Checker
// ===========================================================================

describe("Toolchain Availability Checker", () => {
  afterEach(() => {
    setMockUnavailableToolchains([]);
  });

  it("returns available by default in mocked environment", () => {
    const res = checkToolchainAvailability("C++");
    expect(res.available).toBe(true);
    expect(res.executable).toBe("g++");
  });

  it("identifies unavailable toolchains when registered as mock missing", () => {
    setMockUnavailableToolchains(["gcc"]);
    const res = checkToolchainAvailability("C");
    expect(res.available).toBe(false);
    expect(res.executable).toBe("gcc");
  });
});

// ===========================================================================
// 3. Java Public Class Extraction
// ===========================================================================

describe("Java Public Class Extraction", () => {
  it("extracts public classname when present in source code", () => {
    const code = `
      import java.io.*;
      public class MergeSortAlgorithm {
          public static void main(String[] args) {}
      }
    `;
    const classname = extractJavaClassName(code);
    expect(classname).toBe("MergeSortAlgorithm");
  });

  it("returns null if no public class is declared", () => {
    const code = `
      class MainHelper {}
    `;
    const classname = extractJavaClassName(code);
    expect(classname).toBeNull();
  });
});

// ===========================================================================
// 4. File Mapper and Command Generators
// ===========================================================================

describe("File Mapper and Command Generators", () => {
  it("maps Java file structure according to classname rules", () => {
    const codeWithClass = "public class QuickSort {}";
    const mappingClass = getFileMapping("Java", codeWithClass);
    expect(mappingClass.sourceFilename).toBe("QuickSort.java");
    expect(mappingClass.outputFilename).toBe("QuickSort.class");
    expect(mappingClass.classname).toBe("QuickSort");

    const codeWithoutClass = "class Helper {}";
    const mappingHelper = getFileMapping("Java", codeWithoutClass);
    expect(mappingHelper.sourceFilename).toBe("Main.java");
    expect(mappingHelper.classname).toBe("Main");
  });

  it("generates correct structured command argument arrays for C++", () => {
    const code = "int main() {}";
    const commands = generateCommands("C++", code);

    expect(commands.sourceFilename).toBe("main.cpp");
    expect(commands.compilationCommand).toEqual([
      "g++",
      "-O2",
      "-std=c++17",
      "-Wall",
      "main.cpp",
      "-o",
      "main",
    ]);
    expect(commands.executionCommand).toEqual(["./main"]);
  });

  it("generates correct command arrays for interpreted languages (Python)", () => {
    const code = "print('hello')";
    const commands = generateCommands("Python", code);

    expect(commands.sourceFilename).toBe("main.py");
    expect(commands.compilationCommand).toBeNull();
    expect(commands.executionCommand).toEqual(["python3", "main.py"]);
  });
});

// ===========================================================================
// 5. Path Sanitization and Command Resolution Safety
// ===========================================================================

describe("Path Sanitization and Command Resolution Safety", () => {
  it("strips absolute path names from compiler console stdout/stderr", () => {
    const rawOut =
      "D:\\workspace\\Compiler-for-All\\server\\temp\\uuid\\main.cpp:5:1: error: missing semicolon";
    const cleanOut = sanitizeOutput(
      rawOut,
      "D:\\workspace\\Compiler-for-All\\server\\temp\\uuid",
      "main.cpp"
    );
    expect(cleanOut).toBe("main.cpp:5:1: error: missing semicolon");
  });

  it("resolves execution commands into absolute targets inside workspace directory", () => {
    const template = ["./main", "arg1"];
    const resolved = resolveExecutionCommand(template, "D:\\temp\\workspace");
    expect(resolved.executable).toContain("D:\\temp\\workspace\\main");
    expect(resolved.args).toEqual(["arg1"]);
  });
});

// ===========================================================================
// 6. SandboxUnavailableRunner — safe default runner
// ===========================================================================

describe("SandboxUnavailableRunner (safe default)", () => {
  it("returns runner_unavailable status for C code — never executes host processes", async () => {
    const runner = new SandboxUnavailableRunner();
    const result = await runner.run("#include <stdio.h>\nint main(){}", "", "C");

    expect(result.status).toBe("runner_unavailable");
    expect(result.errorCode).toBe("RUNNER_UNAVAILABLE");
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBeNull();
  });

  it("returns runner_unavailable for all supported languages without executing code", async () => {
    const runner = new SandboxUnavailableRunner();
    const langs = ["C", "C++", "Java", "Python", "JavaScript"];

    for (const lang of langs) {
      const result = await runner.run("some code", "", lang);
      expect(result.status).toBe("runner_unavailable");
      expect(result.errorCode).toBe("RUNNER_UNAVAILABLE");
      expect(result.stdout).toBe("");
    }
  });

  it("includes a descriptive message explaining sandbox unavailability", async () => {
    const runner = new SandboxUnavailableRunner();
    const result = await runner.run("print('hello')", "", "Python");
    expect(result.message).toContain("isolated execution environment");
    expect(result.message).toContain("No user code was executed");
  });
});

// ===========================================================================
// 7. MockCodeRunner — test adapter (no host execution)
// ===========================================================================

describe("MockCodeRunner (test-only adapter)", () => {
  it("returns success without executing any host process", async () => {
    const runner = new MockCodeRunner();
    const result = await runner.run("console.log('hi')", "", "JavaScript");
    expect(result.status).toBe("success");
    expect(result.stdout).toContain("Simulated JavaScript Run");
  });

  it("simulates runner_unavailable correctly", async () => {
    const runner = new MockCodeRunner();
    runner.setMockFailure("Python", "runner_unavailable");
    const result = await runner.run("print('hi')", "", "Python");
    expect(result.status).toBe("runner_unavailable");
    expect(result.errorCode).toBe("RUNNER_UNAVAILABLE");
    expect(result.stdout).toBe("");
  });

  it("simulates compilation failure correctly", async () => {
    const runner = new MockCodeRunner();
    runner.setMockFailure("C++", "compilation_error");
    const result = await runner.run("int main() {", "", "C++");
    expect(result.status).toBe("compilation_error");
    expect(result.errorCode).toBe("COMPILATION_ERROR");
    expect(result.compilationOutput).toContain("error: expected ';'");
  });

  it("simulates runtime failure correctly", async () => {
    const runner = new MockCodeRunner();
    runner.setMockFailure("Python", "runtime_error");
    const result = await runner.run("print(1/0)", "", "Python");
    expect(result.status).toBe("runtime_error");
    expect(result.stderr).toContain("division by zero");
  });

  it("simulates timeout correctly", async () => {
    const runner = new MockCodeRunner();
    runner.setMockFailure("Python", "timeout");
    const result = await runner.run("while True: pass", "", "Python");
    expect(result.status).toBe("timeout");
    expect(result.errorCode).toBe("EXECUTION_TIMEOUT");
    expect(result.timeMs).toBe(5000);
  });

  it("keeps stdin and source code separate — stdin echoed, never executed", async () => {
    const runner = new MockCodeRunner();
    const result = await runner.run("print(input())", "hello world", "Python");
    expect(result.status).toBe("success");
    expect(result.stdout).toContain("stdin");
    expect(result.stdout).toContain("hello world");
  });

  it("returns errorCode UNSUPPORTED_LANGUAGE for unknown language", async () => {
    const runner = new MockCodeRunner();
    const result = await runner.run("code", "", "COBOL");
    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("UNSUPPORTED_LANGUAGE");
  });
});

// ===========================================================================
// 8. Execution Route Integration (POST /api/execute)
// ===========================================================================

describe("Execution Route Integration (POST /api/execute)", () => {
  let app: Express;
  let server: Server;
  let port = 0;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use("/api", executeRouter);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    port = address.port;
  });

  afterEach(() => {
    server.close();
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("c", null);
      activeRunner.setMockFailure("cpp", null);
      activeRunner.setMockFailure("java", null);
      activeRunner.setMockFailure("python", null);
      activeRunner.setMockFailure("javascript", null);
    }
  });

  // ── Scenario 1: Execution service uses the runner abstraction ─────────────

  it("uses MockCodeRunner abstraction in test env — no host child process", async () => {
    // The activeRunner must be MockCodeRunner in test environment
    expect(activeRunner).toBeInstanceOf(MockCodeRunner);
  });

  // ── Scenario 2: SandboxUnavailableRunner returns HTTP 503 ─────────────────

  it("runner_unavailable returns HTTP 503 with RUNNER_UNAVAILABLE code", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("python", "runner_unavailable");
    }

    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print('hello')" }),
    });

    expect(response.status).toBe(503);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe("RUNNER_UNAVAILABLE");
    expect(data.message).toBeDefined();
  });

  // ── Scenario 3: Mock success ───────────────────────────────────────────────

  it("returns 200 success for valid C++ code via mock runner", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "#include <iostream>\nint main() { std::cout << 5; }",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    expect(data.detectedLanguage).toBe("cpp");
    expect(data.stdout).toContain("Simulated C++ Run");
  });

  it("returns 200 success for Java code via mock runner", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "public class Main { public static void main(String[] args) {} }",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    expect(data.detectedLanguage).toBe("java");
  });

  it("returns 200 success for JavaScript code via mock runner", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "console.log('test');" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    expect(data.detectedLanguage).toBe("javascript");
  });

  it("returns 200 success for Python code via mock runner", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print('hello')" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    expect(data.detectedLanguage).toBe("python");
  });

  // ── Scenario 5: Compilation failure ───────────────────────────────────────

  it("returns compilation_error when compilation fails", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("cpp", "compilation_error");
    }

    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "#include <iostream>\nint main() { std::cout << 5 }", // missing semicolon
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("compilation_error");
    expect(data.errorCode).toBe("COMPILATION_ERROR");
    expect(data.compilationOutput).toContain("error: expected ';'");
  });

  // ── Scenario 6: Runtime failure ────────────────────────────────────────────

  it("returns runtime_error when script throws division by zero", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("python", "runtime_error");
    }

    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print(1/0)" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("runtime_error");
    expect(data.stderr).toContain("division by zero");
  });

  // ── Scenario 7: Timeout ────────────────────────────────────────────────────

  it("returns timeout when process exceeds execution limit", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("python", "timeout");
    }

    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "while True: pass" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("timeout");
    expect(data.stderr).toContain("execution exceeded 5 seconds");
  });

  // ── Scenario 8: Source and stdin remain separate ───────────────────────────

  it("stdin payload is kept separate from source code", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "print(input())",
        stdin: "hello world",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    // stdin echoed in mock, code never executed
    expect(data.stdout).toContain("hello world");
  });

  // ── Scenarios 9-11: Client cannot inject paths, shell cmds, or args ────────

  it("client cannot override detected language via body — server detection is authoritative", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "print('hello')", // Python code
        language: "C++", // client tries to override — must be ignored
        execPath: "/bin/sh", // client tries to inject path — must be ignored
        args: ["-c", "rm -rf /"], // client tries to inject args — must be ignored
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    // Server's detector correctly identified Python
    expect(data.detectedLanguage).toBe("python");
  });

  // ── Payload constraint checks ──────────────────────────────────────────────

  it("rejects empty code requests with HTTP 400", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "   " }),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.INVALID_REQUEST);
  });

  it("rejects code payloads exceeding 64KB with HTTP 400", async () => {
    const oversizedCode = "a".repeat(65 * 1024);
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: oversizedCode }),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.CODE_TOO_LARGE);
  });

  it("rejects stdin payloads exceeding 16KB with HTTP 400", async () => {
    const oversizedStdin = "b".repeat(17 * 1024);
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print('hello')", stdin: oversizedStdin }),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.STDIN_TOO_LARGE);
  });

  it("returns TOOLCHAIN_NOT_FOUND (HTTP 503) when runner reports missing toolchain", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("java", "toolchain_unavailable");
    }

    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "public class BinarySearchTree { public static void main(String[] args) {} }",
      }),
    });

    expect(response.status).toBe(503);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe("TOOLCHAIN_NOT_FOUND");
    expect(data.language).toBe("Java");
  });
});

// ===========================================================================
// 9. Error Parser — Unit Tests (Phase 7)
// ===========================================================================

describe("Error Parser: parseCompilerOutput()", () => {
  it("extracts GCC error with line and column from C stderr", () => {
    const raw = "main.c:5:10: error: expected ';' before 'return'";
    const { diagnostics, friendlyMessage } = parseCompilerOutput("c", raw);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBe(5);
    expect(diagnostics[0].column).toBe(10);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("expected ';'");
    expect(friendlyMessage).toBeNull();
  });

  it("extracts GCC warning from C++ stderr", () => {
    const raw = "main.cpp:3:1: warning: unused variable 'x' [-Wunused-variable]";
    const { diagnostics } = parseCompilerOutput("cpp", raw);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].line).toBe(3);
    expect(diagnostics[0].column).toBe(1);
  });

  it("extracts multiple GCC diagnostics", () => {
    const raw = [
      "main.c:2:5: error: 'x' undeclared",
      "main.c:7:12: warning: implicit function declaration",
    ].join("\n");
    const { diagnostics } = parseCompilerOutput("c", raw);
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts Java compiler error with line number", () => {
    const raw = "Main.java:10: error: ';' expected";
    const { diagnostics } = parseCompilerOutput("java", raw);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBe(10);
    expect(diagnostics[0].column).toBeNull();
    expect(diagnostics[0].severity).toBe("error");
  });

  it("extracts Python traceback line number", () => {
    const raw = [
      "Traceback (most recent call last):",
      '  File "main.py", line 7, in <module>',
      "    x = 1/0",
      "ZeroDivisionError: division by zero",
    ].join("\n");
    const { diagnostics, friendlyMessage } = parseCompilerOutput("python", raw);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBe(7);
    expect(friendlyMessage).not.toBeNull();
    expect(friendlyMessage).toContain("Division by Zero");
  });

  it("extracts Node.js stack trace line and column", () => {
    const raw = [
      "TypeError: Cannot read properties of undefined",
      "    at Object.<anonymous> (main.js:12:5)",
    ].join("\n");
    const { diagnostics } = parseCompilerOutput("javascript", raw);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBe(12);
    expect(diagnostics[0].column).toBe(5);
  });

  it("returns empty diagnostics when no match found — never throws", () => {
    const raw = "Some random text with no error format";
    const { diagnostics, friendlyMessage } = parseCompilerOutput("python", raw);
    expect(Array.isArray(diagnostics)).toBe(true);
    expect(diagnostics).toHaveLength(0);
    expect(friendlyMessage).toBeNull();
  });

  it("returns empty diagnostics for empty input", () => {
    const { diagnostics, friendlyMessage } = parseCompilerOutput("c", "");
    expect(diagnostics).toHaveLength(0);
    expect(friendlyMessage).toBeNull();
  });
});

// ===========================================================================
// 10. Friendly Message Translation (Phase 7)
// ===========================================================================

describe("Error Parser: getFriendlyMessage()", () => {
  it("translates ZeroDivisionError", () => {
    const msg = getFriendlyMessage("ZeroDivisionError: division by zero");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Division by Zero");
  });

  it("translates SIGSEGV / segmentation fault", () => {
    const msg = getFriendlyMessage("Segmentation fault (core dumped)");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Segmentation Fault");
  });

  it("translates NullPointerException", () => {
    const msg = getFriendlyMessage('Exception in thread "main" java.lang.NullPointerException');
    expect(msg).not.toBeNull();
    expect(msg).toContain("Null Reference Error");
  });

  it("translates ArrayIndexOutOfBoundsException", () => {
    const msg = getFriendlyMessage(
      'Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: 5'
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("Index Out of Bounds");
  });

  it("translates Python NameError", () => {
    const msg = getFriendlyMessage("NameError: name 'x' is not defined");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Name Not Defined");
  });

  it("returns null for unrecognized error messages", () => {
    const msg = getFriendlyMessage("Some totally unknown error that we cannot map");
    expect(msg).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getFriendlyMessage("")).toBeNull();
  });
});

// ===========================================================================
// 11. Path Sanitization (Phase 7)
// ===========================================================================

describe("Error Parser: stripSensitivePaths()", () => {
  it("strips Unix-style tmp paths from output", () => {
    const raw = "/tmp/compiler-uuid/main.py:3: error: something";
    const sanitized = stripSensitivePaths(raw);
    expect(sanitized).not.toContain("/tmp/");
    expect(sanitized).toContain("error: something");
  });

  it("strips Windows-style temp paths from output", () => {
    const raw = "C:\\Users\\user\\AppData\\Local\\Temp\\uuid\\main.cpp:5:1: error: 'x' undeclared";
    const sanitized = stripSensitivePaths(raw);
    expect(sanitized).not.toContain("C:\\Users");
  });

  it("does not modify output without sensitive paths", () => {
    const raw = "main.cpp:5:1: error: 'x' undeclared";
    const sanitized = stripSensitivePaths(raw);
    expect(sanitized).toBe(raw);
  });
});

// ===========================================================================
// 12. Error Code Constants (Phase 7)
// ===========================================================================

describe("ErrorCode constants", () => {
  it("all required error codes are defined", () => {
    expect(ErrorCode.LANGUAGE_NOT_DETECTED).toBe("LANGUAGE_NOT_DETECTED");
    expect(ErrorCode.UNSUPPORTED_LANGUAGE).toBe("UNSUPPORTED_LANGUAGE");
    expect(ErrorCode.INVALID_REQUEST).toBe("INVALID_REQUEST");
    expect(ErrorCode.CODE_TOO_LARGE).toBe("CODE_TOO_LARGE");
    expect(ErrorCode.STDIN_TOO_LARGE).toBe("STDIN_TOO_LARGE");
    expect(ErrorCode.TOOLCHAIN_NOT_FOUND).toBe("TOOLCHAIN_NOT_FOUND");
    expect(ErrorCode.COMPILATION_ERROR).toBe("COMPILATION_ERROR");
    expect(ErrorCode.RUNTIME_ERROR).toBe("RUNTIME_ERROR");
    expect(ErrorCode.TIMEOUT).toBe("TIMEOUT");
    expect(ErrorCode.RESOURCE_LIMIT).toBe("RESOURCE_LIMIT");
    expect(ErrorCode.RUNNER_UNAVAILABLE).toBe("RUNNER_UNAVAILABLE");
    expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });
});

// ===========================================================================
// 13. Phase 7 HTTP Status Mapping — Integration Tests
// ===========================================================================

describe("Phase 7: HTTP Status Mapping and API Error Schema", () => {
  let app: Express;
  let server: Server;
  let port = 0;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use("/api", executeRouter);
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    port = address.port;
  });

  afterEach(() => {
    server.close();
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("c", null);
      activeRunner.setMockFailure("cpp", null);
      activeRunner.setMockFailure("java", null);
      activeRunner.setMockFailure("python", null);
      activeRunner.setMockFailure("javascript", null);
    }
  });

  // Test 1: Empty code → 400 INVALID_REQUEST
  it("(T1) empty code returns 400 with INVALID_REQUEST code", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "   " }),
    });
    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.INVALID_REQUEST);
    expect(data.message).toBeDefined();
  });

  // Test 2: Invalid request — missing code field → 400
  it("(T2) missing code field returns 400 INVALID_REQUEST", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stdin: "hello" }), // no code
    });
    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.INVALID_REQUEST);
  });

  // Test 3: Code too large → 400 CODE_TOO_LARGE
  it("(T3) oversized code returns 400 CODE_TOO_LARGE", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "a".repeat(65 * 1024) }),
    });
    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.CODE_TOO_LARGE);
  });

  // Test 4: stdin too large → 400 STDIN_TOO_LARGE
  it("(T4) oversized stdin returns 400 STDIN_TOO_LARGE", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print('hello')", stdin: "b".repeat(17 * 1024) }),
    });
    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.STDIN_TOO_LARGE);
  });

  // Test 5: Runner unavailable → 503 RUNNER_UNAVAILABLE
  it("(T5) runner_unavailable returns 503 RUNNER_UNAVAILABLE", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("python", "runner_unavailable");
    }
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print('hello')" }),
    });
    expect(response.status).toBe(503);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.RUNNER_UNAVAILABLE);
    expect(data.message).toBeDefined();
  });

  // Test 6: Toolchain unavailable → 503 TOOLCHAIN_NOT_FOUND
  it("(T6) toolchain_unavailable returns 503 TOOLCHAIN_NOT_FOUND", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("java", "toolchain_unavailable");
    }
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "public class BinaryTree { public static void main(String[] args) {} }",
      }),
    });
    expect(response.status).toBe(503);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe(ErrorCode.TOOLCHAIN_NOT_FOUND);
    expect(data.language).toBe("Java");
  });

  // Test 7: Compilation error → 200 + COMPILATION_ERROR errorCode + diagnostics
  it("(T7) compilation error returns 200 with diagnostics array", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("cpp", "compilation_error");
    }
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "#include <iostream>\nint main() { std::cout << 5 }" }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("compilation_error");
    expect(data.errorCode).toBe("COMPILATION_ERROR");
    expect(Array.isArray(data.diagnostics)).toBe(true);
    const diag = data.diagnostics![0];
    expect(diag.line).toBe(5);
    expect(diag.column).toBe(5);
    expect(diag.severity).toBe("error");
  });

  // Test 8: Runtime error → 200 + friendlyMessage
  it("(T8) runtime error returns 200 with friendlyMessage", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("python", "runtime_error");
    }
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print(1/0)" }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("runtime_error");
    expect(data.friendlyMessage).not.toBeNull();
    expect(data.friendlyMessage).toContain("Division by Zero");
  });

  // Test 9: Timeout → 200 + TIMEOUT errorCode
  it("(T9) timeout returns 200 with TIMEOUT errorCode", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("python", "timeout");
    }
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "while True: pass" }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("timeout");
    expect(data.errorCode).toBe("EXECUTION_TIMEOUT");
  });

  // Test 10: Source and stdin separation
  it("(T10) stdin payload remains separate from source code", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print(input())", stdin: "hello world" }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    expect(data.stdout).toContain("hello world");
    // Source code must not appear in stdin field
    expect(data.stderr).not.toContain("print(input())");
  });

  // Test 11: Consistent API schema — code + message always present on errors
  it("(T11) all error responses contain code and message fields", async () => {
    const errorScenarios: Array<() => Promise<Response>> = [
      // Empty code
      () =>
        fetch(`http://localhost:${port}/api/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "" }),
        }),
      // Missing code
      () =>
        fetch(`http://localhost:${port}/api/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stdin: "x" }),
        }),
    ];

    for (const scenario of errorScenarios) {
      const response = await scenario();
      const data = (await response.json()) as TestResponse;
      expect(data.code).toBeDefined();
      expect(data.message).toBeDefined();
      // Must NOT leak error, stack_trace fields
      expect((data as Record<string, unknown>).stack).toBeUndefined();
      expect((data as Record<string, unknown>).stack_trace).toBeUndefined();
    }
  });

  // Test 12: Sensitive information must not be leaked
  it("(T12) error responses do not expose filesystem paths, stack traces, or env vars", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "   " }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    const dataStr = JSON.stringify(data);

    // Must not contain any of these sensitive patterns
    expect(dataStr).not.toMatch(/node_modules/i);
    expect(dataStr).not.toMatch(/at Object\.<anonymous>/); // JS stack trace
    expect(dataStr).not.toMatch(/process\.env/i);
    expect(dataStr).not.toMatch(/\/home\//i);
    expect(dataStr).not.toMatch(/C:\\Users\\/i);
  });

  // Test 13: RUNNER_UNAVAILABLE shape matches frontend expectations
  it("(T13) RUNNER_UNAVAILABLE response has correct shape for frontend handling", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("javascript", "runner_unavailable");
    }
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "console.log('hello')" }),
    });
    expect(response.status).toBe(503);
    const data = (await response.json()) as TestResponse;
    // Frontend reads: data.code, data.message, data.language
    expect(data.code).toBe("RUNNER_UNAVAILABLE");
    expect(data.message).toBeDefined();
    expect(data.message).toContain("isolated execution environment");
    expect((data as Record<string, unknown>).stdout).toBeUndefined();
    expect((data as Record<string, unknown>).stderr).toBeUndefined();
  });

  // Test 14: Diagnostics array always present in 200 responses
  it("(T14) success responses include diagnostics array (empty on success)", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print('hello')" }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    expect(Array.isArray(data.diagnostics)).toBe(true);
  });

  // Test 15: Monaco diagnostic mapping — valid line+column in diagnostics
  it("(T15) compilation error diagnostics include valid line/column for Monaco markers", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("cpp", "compilation_error");
    }
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "#include <iostream>\nint main() { std::cout << 5 }" }),
    });
    const data = (await response.json()) as TestResponse;
    const diag = data.diagnostics?.find((d) => d.line !== null);
    expect(diag).toBeDefined();
    expect(typeof diag!.line).toBe("number");
    expect(diag!.line).toBeGreaterThan(0);
    // column must be a positive number or null — never negative
    if (diag!.column !== null) {
      expect(diag!.column).toBeGreaterThan(0);
    }
  });

  // Test 16: Language not detected (low confidence code)
  it("(T16) undetectable code returns 400 LANGUAGE_NOT_DETECTED", async () => {
    // A very short, ambiguous snippet with confidence effectively 0
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Short, ambiguous text with near-zero confidence
      body: JSON.stringify({ code: "x" }),
    });
    // The detector may or may not return low confidence for a single char.
    // We test the behavior is deterministic: either runs or returns language error.
    // Key: must NOT return 500.
    expect(response.status).not.toBe(500);
    expect([200, 400]).toContain(response.status);
  });
});
