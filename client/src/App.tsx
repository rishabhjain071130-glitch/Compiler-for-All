import { useState, useEffect } from "react";
import Layout from "./components/Layout.tsx";
import EditorPane from "./components/EditorPane.tsx";
import Console from "./components/Console.tsx";
import ControlBar from "./components/ControlBar.tsx";
import { detectLanguage, DetectionResult } from "../../shared/detector.ts";

interface ExecutionResult {
  status:
    | "success"
    | "compilation_error"
    | "runtime_error"
    | "resource_limit_exceeded"
    | "timeout"
    | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number | null;
}

const DEFAULT_CODE = `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`;

export default function App() {
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [stdin, setStdin] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("output");
  const [detectionResult, setDetectionResult] = useState<DetectionResult>({
    language: "C",
    confidence: 1.0,
    reasons: ["Initial template default"],
  });
  const [executing, setExecuting] = useState<boolean>(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const detectedLanguage = detectionResult.language;

  // Authoritative multi-signal language auto-detection
  useEffect(() => {
    const res = detectLanguage(code);
    setDetectionResult(res);
  }, [code]);

  // Simulated code execution run
  const handleRun = () => {
    setExecuting(true);
    setResult(null);

    // Simulated 1.5s compile/sandbox execution lag
    setTimeout(() => {
      const lowerCode = code.toLowerCase();
      let mockResult: ExecutionResult;

      // 1. Simulate compile errors if user explicitly typed invalid keywords
      if (lowerCode.includes("syntax error") || lowerCode.includes("missing semicolon")) {
        mockResult = {
          status: "compilation_error",
          stdout: "",
          stderr:
            "main.cpp: In function 'int main()':\nmain.cpp:5:5: error: expected ';' before 'return'",
          exitCode: 1,
          timeMs: 140,
        };
        setActiveTab("compiler");
      }
      // 2. Simulate infinite loop timeouts
      else if (lowerCode.includes("while (true)") || lowerCode.includes("while true:")) {
        mockResult = {
          status: "timeout",
          stdout: "",
          stderr: "SIGTERM: Process terminated because runtime execution exceeded 5 seconds.",
          exitCode: 124,
          timeMs: 5000,
        };
        setActiveTab("output");
      }
      // 3. Simulate resource limit leaks
      else if (lowerCode.includes("out of memory") || lowerCode.includes("leak")) {
        mockResult = {
          status: "resource_limit_exceeded",
          stdout: "",
          stderr: "SIGKILL: Process terminated. Memory usage limit of 64MB was exceeded.",
          exitCode: 137,
          timeMs: 380,
        };
        setActiveTab("output");
      }
      // 4. Simulate runtime errors
      else if (
        lowerCode.includes("throw") ||
        lowerCode.includes("exception") ||
        lowerCode.includes("/ 0")
      ) {
        mockResult = {
          status: "runtime_error",
          stdout: "",
          stderr: lowerCode.includes("/ 0")
            ? "ArithmeticError: division by zero"
            : "RuntimeException: Uncaught exception triggered by main thread execution.",
          exitCode: 1,
          timeMs: 45,
        };
        setActiveTab("output");
      }
      // 5. Successful Execution mock based on detected language
      else {
        let executionOutput = "";
        let runTime = 20;

        switch (detectedLanguage) {
          case "C":
            executionOutput = "Hello, World! (Simulated C Execution)\n";
            runTime = 35;
            break;
          case "C++":
            executionOutput = "Hello, World! (Simulated C++ Execution)\n";
            runTime = 42;
            break;
          case "Java":
            executionOutput = "Hello, World! (Simulated Java Execution)\n";
            runTime = 65;
            break;
          case "Python":
            executionOutput = "Hello, World! (Simulated Python Execution)\n";
            runTime = 12;
            break;
          case "JavaScript":
            executionOutput = "Hello, World! (Simulated Node.js Execution)\n";
            runTime = 22;
            break;
          default:
            executionOutput = "Hello, World! (Simulated Default Execution)\n";
            runTime = 15;
        }

        // Add stdin content if provided
        if (stdin.trim()) {
          executionOutput += `\nInput received (stdin): "${stdin}"`;
        }

        mockResult = {
          status: "success",
          stdout: executionOutput,
          stderr: "",
          exitCode: 0,
          timeMs: runTime,
        };
        setActiveTab("output");
      }

      setResult(mockResult);
      setExecuting(false);
    }, 1500);
  };

  return (
    <Layout
      controlBar={
        <ControlBar
          detectedLanguage={detectedLanguage}
          confidence={detectionResult.confidence}
          executing={executing}
          onRun={handleRun}
        />
      }
    >
      {/* Left Pane: Code Editor container */}
      <EditorPane code={code} onChangeCode={setCode} detectedLanguage={detectedLanguage} />

      {/* Right Pane: Stdin and Tabbed Stdout Console */}
      <Console
        stdin={stdin}
        onChangeStdin={setStdin}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        result={result}
        executing={executing}
        detectionResult={detectionResult}
      />
    </Layout>
  );
}
