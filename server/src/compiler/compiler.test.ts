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
import { MockCodeRunner, sanitizeOutput, resolveExecutionCommand } from "./runner.js";

interface TestResponse {
  status?: string;
  detectedLanguage?: string;
  compilationCommand?: string[] | null;
  executionCommand?: string[];
  sourceFilename?: string;
  stdout?: string;
  stderr?: string;
  code?: string;
  language?: string;
  error?: string;
  compilationOutput?: string;
}

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

  it("generates correct structured command arguments arrays for C++", () => {
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

describe("Execution Route Integration (POST /api/execute)", () => {
  let app: Express;
  let server: Server;
  let port = 0;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use("/api", executeRouter);

    // Start on random port
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

  it("returns status 200 and success response for valid C++ requests", async () => {
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

  it("returns status 200 and success response for Java execution requests", async () => {
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

  it("returns status 200 and success response for JavaScript execution requests", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "console.log('test');",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    expect(data.detectedLanguage).toBe("javascript");
  });

  it("returns status 200 and success response for Python execution requests", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "print('hello')",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("success");
    expect(data.detectedLanguage).toBe("python");
  });

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
      body: JSON.stringify({
        code: "print('hello')",
        stdin: oversizedStdin,
      }),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as TestResponse;
    expect(data.error).toBe("Payload Too Large");
  });

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

  it("returns timeout when process exceeds execution limit", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("python", "timeout");
    }

    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "while True: pass",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("timeout");
    expect(data.stderr).toContain("execution exceeded 5 seconds");
  });

  it("returns runtime_error when script throws divisions by zero", async () => {
    if (activeRunner instanceof MockCodeRunner) {
      activeRunner.setMockFailure("python", "runtime_error");
    }

    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "print(1/0)",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TestResponse;
    expect(data.status).toBe("runtime_error");
    expect(data.stderr).toContain("division by zero");
  });

  it("returns TOOLCHAIN_NOT_FOUND when runner toolchain is missing", async () => {
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
