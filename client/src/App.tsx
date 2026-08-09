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
    | "error"
    | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number | null;
  compilationOutput?: string;
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

  // Real code execution run
  const handleRun = async () => {
    setExecuting(true);
    setResult(null);

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          stdin,
        }),
      });

      if (response.status === 400) {
        const errData = await response.json();
        if (errData.code === "TOOLCHAIN_NOT_FOUND") {
          setResult({
            status: "error",
            stdout: "",
            stderr: "Execution environment unavailable",
            exitCode: null,
            timeMs: null,
            compilationOutput: errData.message,
          });
          setActiveTab("compiler");
          setExecuting(false);
          return;
        } else {
          setResult({
            status: "error",
            stdout: "",
            stderr: errData.message || errData.error || "Bad Request",
            exitCode: null,
            timeMs: null,
          });
          setActiveTab("output");
          setExecuting(false);
          return;
        }
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const resData = await response.json();
      setResult({
        status: resData.status,
        stdout: resData.stdout,
        stderr: resData.stderr,
        exitCode: resData.exitCode,
        timeMs: resData.timeMs,
        compilationOutput: resData.compilationOutput,
      });

      if (resData.status === "compilation_error") {
        setActiveTab("compiler");
      } else {
        setActiveTab("output");
      }
    } catch (err: unknown) {
      const error = err as Error;
      setResult({
        status: "error",
        stdout: "",
        stderr: error.message || "Failed to contact host compilation engine.",
        exitCode: null,
        timeMs: null,
      });
      setActiveTab("output");
    } finally {
      setExecuting(false);
    }
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
