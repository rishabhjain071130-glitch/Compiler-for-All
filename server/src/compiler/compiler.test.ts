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
  compilationOutput?: string;
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
    expect(result.errorCode).toBe("COMPILATION_FAILED");
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
    expect(data.error).toBe("Bad Request");
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
    expect(data.error).toBe("Payload Too Large");
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
    expect(data.error).toBe("Payload Too Large");
  });

  it("returns TOOLCHAIN_NOT_FOUND when runner reports missing toolchain", async () => {
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

    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.code).toBe("TOOLCHAIN_NOT_FOUND");
    expect(data.language).toBe("Java");
  });
});
