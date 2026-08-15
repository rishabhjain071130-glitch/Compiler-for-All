import { useState, useCallback, useEffect } from "react";
import Layout from "./components/Layout.tsx";
import EditorPane from "./components/EditorPane.tsx";
import Console from "./components/Console.tsx";
import ControlBar from "./components/ControlBar.tsx";
import { detectLanguage, DetectionResult } from "../../shared/detector.ts";
import { ExecutionResult, DiagnosticMarker, ClientErrorCode } from "./types/execution.ts";

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
  const [diagnostics, setDiagnostics] = useState<DiagnosticMarker[]>([]);

  const detectedLanguage = detectionResult.language;

  // Authoritative multi-signal language auto-detection
  useEffect(() => {
    const res = detectLanguage(code);
    setDetectionResult(res);
  }, [code]);

  // Clear Monaco markers whenever code changes (edit clears error highlights)
  const handleCodeChange = useCallback(
    (newCode: string) => {
      setCode(newCode);
      if (diagnostics.length > 0) {
        setDiagnostics([]);
      }
    },
    [diagnostics.length]
  );

  // Real code execution run
  const handleRun = async () => {
    setExecuting(true);
    setResult(null);
    // Clear all previous markers before starting a new run
    setDiagnostics([]);

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

      // --- HTTP 503: Runner/Toolchain unavailable ---
      if (response.status === 503) {
        const errData = (await response.json()) as {
          code?: string;
          message?: string;
          language?: string;
        };
        const errorCode = errData.code ?? ClientErrorCode.RUNNER_UNAVAILABLE;
        setResult({
          status:
            errorCode === ClientErrorCode.TOOLCHAIN_NOT_FOUND ? "error" : "runner_unavailable",
          errorCode,
          stdout: "",
          stderr: "",
          exitCode: null,
          timeMs: null,
          message: errData.message,
        });
        setActiveTab(errorCode === ClientErrorCode.TOOLCHAIN_NOT_FOUND ? "compiler" : "output");
        setExecuting(false);
        return;
      }

      // --- HTTP 400: Client-side / validation errors ---
      if (response.status === 400) {
        const errData = (await response.json()) as {
          code?: string;
          message?: string;
        };
        const errorCode = errData.code ?? ClientErrorCode.INVALID_REQUEST;
        setResult({
          status: "error",
          errorCode,
          stdout: "",
          stderr: errData.message || "Bad Request",
          exitCode: null,
          timeMs: null,
          message: errData.message,
        });
        setActiveTab("output");
        setExecuting(false);
        return;
      }

      // --- HTTP 500: Internal server error ---
      if (response.status === 500) {
        setResult({
          status: "error",
          errorCode: ClientErrorCode.INTERNAL_ERROR,
          stdout: "",
          stderr: "An unexpected server error occurred. Please try again.",
          exitCode: null,
          timeMs: null,
        });
        setActiveTab("output");
        setExecuting(false);
        return;
      }

      if (!response.ok) {
        setResult({
          status: "error",
          errorCode: ClientErrorCode.INTERNAL_ERROR,
          stdout: "",
          stderr: `Server returned status ${response.status}.`,
          exitCode: null,
          timeMs: null,
        });
        setActiveTab("output");
        setExecuting(false);
        return;
      }

      // --- HTTP 200: Execution result (may be success, error, timeout, etc.) ---
      const resData = (await response.json()) as {
        status: ExecutionResult["status"];
        stdout?: string;
        stderr?: string;
        exitCode?: number | null;
        timeMs?: number | null;
        compilationOutput?: string;
        message?: string;
        errorCode?: string;
        diagnostics?: DiagnosticMarker[];
        friendlyMessage?: string | null;
      };

      // Apply Monaco markers for any diagnostics with valid line numbers
      const parsedDiagnostics = (resData.diagnostics ?? []).filter(
        (d): d is DiagnosticMarker & { line: number } => d.line !== null
      );
      if (parsedDiagnostics.length > 0) {
        setDiagnostics(parsedDiagnostics);
      }

      setResult({
        status: resData.status,
        errorCode: resData.errorCode,
        stdout: resData.stdout ?? "",
        stderr: resData.stderr ?? "",
        exitCode: resData.exitCode ?? null,
        timeMs: resData.timeMs ?? null,
        compilationOutput: resData.compilationOutput,
        message: resData.message,
        diagnostics: resData.diagnostics,
        friendlyMessage: resData.friendlyMessage,
      });

      // Route to the most relevant tab automatically
      if (resData.status === "compilation_error") {
        setActiveTab("compiler");
      } else {
        setActiveTab("output");
      }
    } catch (err: unknown) {
      const error = err as Error;
      setResult({
        status: "error",
        errorCode: ClientErrorCode.INTERNAL_ERROR,
        stdout: "",
        stderr: error.message || "Failed to contact the compilation server.",
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
      <EditorPane
        code={code}
        onChangeCode={handleCodeChange}
        detectedLanguage={detectedLanguage}
        diagnostics={diagnostics}
      />

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
