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
import executeRouter from "../routes/execute.js";

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
    setMockUnavailableToolchains([]);
  });

  it("handles valid C++ compile and execution requests", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "#include <iostream>\nint main() { std::cout << 5; }",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.detectedLanguage).toBe("cpp");
    expect(data.compilationCommand).toContain("g++");
    expect(data.executionCommand).toContain("./main");
  });

  it("handles Java class mapping parameters", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "public class BinarySearchTree { public static void main(String[] args) {} }",
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.detectedLanguage).toBe("java");
    expect(data.sourceFilename).toBe("BinarySearchTree.java");
    expect(data.compilationCommand).toEqual(["javac", "BinarySearchTree.java"]);
    expect(data.executionCommand).toEqual(["java", "BinarySearchTree"]);
  });

  it("rejects empty code buffers", async () => {
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "" }),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Bad Request");
  });

  it("returns TOOLCHAIN_NOT_FOUND if compiler is mock missing", async () => {
    setMockUnavailableToolchains(["javac"]);
    const response = await fetch(`http://localhost:${port}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "public class Main { public static void main(String[] args) {} }",
      }),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.code).toBe("TOOLCHAIN_NOT_FOUND");
    expect(data.language).toBe("Java");
  });
});
