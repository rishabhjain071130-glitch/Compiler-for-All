import { DetectionResult } from "../../../shared/detector.ts";
import { ExecutionResult, ClientErrorCode } from "../types/execution.ts";

interface ConsoleProps {
  stdin: string;
  onChangeStdin: (val: string) => void;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  result: ExecutionResult | null;
  executing: boolean;
  detectionResult: DetectionResult;
}

// ---------------------------------------------------------------------------
// FriendlyMessage — renders a beginner-friendly error explanation card.
// Supports simple **bold** markdown in the message string.
// ---------------------------------------------------------------------------

function FriendlyMessage({ message }: { message: string }) {
  // Render **text** as bold spans
  const parts = message.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div style={styles.friendlyCard}>
      <span style={styles.friendlyIcon}>💡</span>
      <p style={styles.friendlyText}>
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          return part;
        })}
      </p>
    </div>
  );
}

export default function Console({
  stdin,
  onChangeStdin,
  activeTab,
  onChangeTab,
  result,
  executing,
  detectionResult,
}: ConsoleProps) {
  // ---------------------------------------------------------------------------
  // renderOutput — maps execution status to UI for the selected tab
  // ---------------------------------------------------------------------------
  const renderOutput = () => {
    if (executing) {
      return <div style={styles.logTextMuted}>Executing sandboxed environment...</div>;
    }

    if (!result || result.status === null) {
      return (
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>📭</span>
          <span>Click &quot;Run Code&quot; to view execution output.</span>
        </div>
      );
    }

    switch (activeTab) {
      case "output":
        return renderOutputTab(result);

      case "compiler":
        return renderCompilerTab(result);

      case "metrics":
        return renderMetricsTab(result, detectionResult);

      default:
        return null;
    }
  };

  // ---------------------------------------------------------------------------
  // renderOutputTab — Console Output tab content
  // ---------------------------------------------------------------------------
  const renderOutputTab = (r: ExecutionResult) => {
    // Sandbox unavailable — Phase 6/7 default state
    if (r.status === "runner_unavailable") {
      return (
        <div style={styles.sandboxBanner}>
          <span style={styles.badgeAmber}>⚙️ Sandbox Not Available</span>
          <p style={styles.errorTitle}>The isolated execution environment is not yet active.</p>
          <p style={styles.sandboxNote}>
            Code execution requires a sandboxed runner (Phase 8: Sandbox Isolation). No code was
            executed on the host system.
          </p>
        </div>
      );
    }

    // Language not detected
    if (r.status === "error" && r.errorCode === ClientErrorCode.LANGUAGE_NOT_DETECTED) {
      return (
        <div style={styles.detectionBanner}>
          <span style={styles.badgeAmber}>🔍 Language Not Detected</span>
          <p style={styles.errorTitle}>
            {r.message ||
              "Unable to determine the programming language. Write more code so the engine can detect it."}
          </p>
          <p style={styles.sandboxNote}>
            The auto-detection engine requires meaningful code. Try adding imports, function
            definitions, or language-specific keywords.
          </p>
        </div>
      );
    }

    // Compilation error — direct the user to the Compiler Output tab
    if (r.status === "compilation_error") {
      return (
        <div style={styles.errorBanner}>
          <span style={styles.badgeRose}>Compilation Failed</span>
          <p style={styles.errorTitle}>
            The compiler encountered errors. Check the{" "}
            <strong style={{ color: "var(--accent-cyan)", cursor: "pointer" }}>
              Compiler Output
            </strong>{" "}
            tab for detailed messages.
          </p>
          {r.friendlyMessage && <FriendlyMessage message={r.friendlyMessage} />}
        </div>
      );
    }

    // Runtime timeout
    if (r.status === "timeout") {
      return (
        <div style={styles.errorBanner}>
          <span style={styles.badgeRose}>Timeout — Execution Limit Exceeded</span>
          <p style={styles.errorTitle}>
            Your code exceeded the maximum execution time (5 seconds). Check for infinite loops or
            blocking operations.
          </p>
          {r.stderr && <pre style={styles.errorOutput}>{r.stderr}</pre>}
        </div>
      );
    }

    // Resource limit exceeded
    if (r.status === "resource_limit_exceeded") {
      return (
        <div style={styles.errorBanner}>
          <span style={styles.badgeRose}>Resource Limit Exceeded</span>
          <p style={styles.errorTitle}>
            Your code exceeded the memory limit (64 MB) or another resource quota and was terminated
            by the sandbox.
          </p>
        </div>
      );
    }

    // Runtime error — show stderr and friendly message
    if (r.status === "runtime_error") {
      return (
        <div style={styles.errorContainer}>
          <div style={styles.errorBanner}>
            <span style={styles.badgeRose}>Runtime Error</span>
            <p style={styles.errorTitle}>
              Your program exited with an error.
              {r.exitCode !== null ? ` (Exit code: ${r.exitCode})` : ""}
            </p>
          </div>
          {r.friendlyMessage && <FriendlyMessage message={r.friendlyMessage} />}
          {r.stderr && (
            <div style={styles.rawSection}>
              <div style={styles.rawSectionLabel}>Program Output (stderr)</div>
              <pre style={styles.errorOutput}>{r.stderr}</pre>
            </div>
          )}
        </div>
      );
    }

    // Generic error (invalid request, language not detected, etc.)
    if (r.status === "error") {
      return renderErrorByCode(r);
    }

    // Success — display stdout
    return (
      <div style={styles.outputContainer}>
        {r.stdout ? (
          <pre style={styles.rawOutput}>{r.stdout}</pre>
        ) : (
          <div style={styles.logTextMuted}>
            Program executed successfully but returned no output.
          </div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // renderErrorByCode — maps error codes to specific UI banners
  // ---------------------------------------------------------------------------
  const renderErrorByCode = (r: ExecutionResult) => {
    switch (r.errorCode) {
      case ClientErrorCode.TOOLCHAIN_NOT_FOUND:
        return (
          <div style={styles.detectionBanner}>
            <span style={styles.badgeAmber}>⚙️ Toolchain Not Available</span>
            <p style={styles.errorTitle}>
              {r.message ||
                "The compiler or interpreter for this language is not configured in the execution environment."}
            </p>
          </div>
        );
      case ClientErrorCode.CODE_TOO_LARGE:
        return (
          <div style={styles.errorBanner}>
            <span style={styles.badgeRose}>Code Too Large</span>
            <p style={styles.errorTitle}>{r.message || "Code payload exceeds the 64 KB limit."}</p>
          </div>
        );
      case ClientErrorCode.STDIN_TOO_LARGE:
        return (
          <div style={styles.errorBanner}>
            <span style={styles.badgeRose}>Stdin Too Large</span>
            <p style={styles.errorTitle}>
              {r.message || "Standard input payload exceeds the 16 KB limit."}
            </p>
          </div>
        );
      case ClientErrorCode.UNSUPPORTED_LANGUAGE:
        return (
          <div style={styles.detectionBanner}>
            <span style={styles.badgeAmber}>Unsupported Language</span>
            <p style={styles.errorTitle}>
              {r.message ||
                "The detected language is not supported. Supported: C, C++, Java, Python, JavaScript."}
            </p>
          </div>
        );
      case ClientErrorCode.INTERNAL_ERROR:
        return (
          <div style={styles.errorBanner}>
            <span style={styles.badgeRose}>Internal Server Error</span>
            <p style={styles.errorTitle}>
              {r.message || "An unexpected server error occurred. Please try again in a moment."}
            </p>
          </div>
        );
      default:
        return (
          <div style={styles.errorBanner}>
            <span style={styles.badgeRose}>Error</span>
            <p style={styles.errorTitle}>
              {r.stderr || r.message || "An error occurred. Please try again."}
            </p>
          </div>
        );
    }
  };

  // ---------------------------------------------------------------------------
  // renderCompilerTab — Compiler Output tab content
  // ---------------------------------------------------------------------------
  const renderCompilerTab = (r: ExecutionResult) => {
    const compText = r.compilationOutput || (r.status === "compilation_error" ? r.stderr : "");
    const hasDiagnosticsWithLocation = r.diagnostics && r.diagnostics.some((d) => d.line !== null);

    return (
      <div style={styles.outputContainer}>
        {hasDiagnosticsWithLocation && (
          <div style={styles.diagnosticsBanner}>
            <span style={styles.diagnosticsLabel}>🔴 Editor markers applied</span>
            <span style={styles.diagnosticsNote}>
              Error locations are highlighted in the code editor.
            </span>
          </div>
        )}
        {compText ? (
          <pre style={styles.errorOutput}>{compText}</pre>
        ) : (
          <div style={styles.logTextMuted}>No compiler errors or warnings logged.</div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // renderMetricsTab — Metrics tab content
  // ---------------------------------------------------------------------------
  const renderMetricsTab = (r: ExecutionResult, det: DetectionResult) => {
    const statusColor =
      r.status === "success"
        ? styles.metricValueGreen
        : r.status === "runner_unavailable"
          ? styles.metricValueAmber
          : styles.metricValueRed;

    return (
      <div style={styles.metricsContainer}>
        <div style={styles.metricRow}>
          <span style={styles.metricLabel}>Sandbox Status:</span>
          <span style={statusColor}>{r.status?.toUpperCase().replace(/_/g, " ") || "IDLE"}</span>
        </div>
        <div style={styles.metricRow}>
          <span style={styles.metricLabel}>Execution Duration:</span>
          <span style={styles.metricValue}>{r.timeMs !== null ? `${r.timeMs} ms` : "N/A"}</span>
        </div>
        <div style={styles.metricRow}>
          <span style={styles.metricLabel}>Process Exit Code:</span>
          <span style={styles.metricValue}>{r.exitCode !== null ? r.exitCode : "N/A"}</span>
        </div>
        <div style={styles.metricRow}>
          <span style={styles.metricLabel}>Memory Resource Pool:</span>
          <span style={styles.metricValue}>64 MB Limit (Isolated)</span>
        </div>
        <div style={styles.metricRow}>
          <span style={styles.metricLabel}>Sandbox Runtime:</span>
          <span style={styles.metricValue}>gVisor Kernel Sandbox</span>
        </div>

        <div style={styles.metricSectionHeader}>Language Detection Metrics</div>
        <div style={styles.metricRow}>
          <span style={styles.metricLabel}>Speculated Target:</span>
          <span style={styles.metricValue}>{det.language}</span>
        </div>
        <div style={styles.metricRow}>
          <span style={styles.metricLabel}>Detection Confidence:</span>
          <span style={styles.metricValue}>{Math.round(det.confidence * 100)}%</span>
        </div>
        <div style={styles.reasonsContainer}>
          <span style={styles.metricLabel}>Engine Reasons / Signals:</span>
          {det.reasons.length > 0 ? (
            <ul style={styles.reasonsList}>
              {det.reasons.map((r, i) => (
                <li key={i} style={styles.reasonItem}>
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <div style={styles.logTextMuted}>No signals matched. Defaulting logic active.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Input Panel (stdin) */}
      <div style={styles.inputCard} className="glass-panel">
        <div style={styles.panelHeader}>
          <span style={styles.title}>Console Input (stdin)</span>
        </div>
        <textarea
          value={stdin}
          onChange={(e) => onChangeStdin(e.target.value)}
          placeholder="Type arguments or standard input streams here..."
          style={styles.stdinTextarea}
          spellCheck={false}
        />
      </div>

      {/* Output Panel */}
      <div style={styles.outputCard} className="glass-panel">
        <div style={styles.tabHeader}>
          <div style={styles.tabs}>
            <button
              onClick={() => onChangeTab("output")}
              style={{
                ...styles.tabButton,
                ...(activeTab === "output" ? styles.activeTabButton : {}),
              }}
            >
              Console Output
            </button>
            <button
              onClick={() => onChangeTab("compiler")}
              style={{
                ...styles.tabButton,
                ...(activeTab === "compiler" ? styles.activeTabButton : {}),
              }}
            >
              Compiler Output
            </button>
            <button
              onClick={() => onChangeTab("metrics")}
              style={{
                ...styles.tabButton,
                ...(activeTab === "metrics" ? styles.activeTabButton : {}),
              }}
            >
              Metrics
            </button>
          </div>
        </div>

        <div style={styles.outputBody}>{renderOutput()}</div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    height: "100%",
  },
  inputCard: {
    height: "150px",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    flexShrink: 0,
  },
  panelHeader: {
    height: "36px",
    borderBottom: "1px solid var(--border-color)",
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    backgroundColor: "rgba(0, 0, 0, 0.12)",
  },
  title: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  },
  stdinTextarea: {
    flex: 1,
    border: "none",
    outline: "none",
    resize: "none" as const,
    backgroundColor: "var(--bg-textarea)",
    color: "var(--text-main)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    padding: "12px",
  },
  outputCard: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  tabHeader: {
    height: "36px",
    borderBottom: "1px solid var(--border-color)",
    backgroundColor: "rgba(0, 0, 0, 0.12)",
    display: "flex",
    alignItems: "center",
    padding: "0 8px",
    flexShrink: 0,
  },
  tabs: {
    display: "flex",
    gap: "4px",
    height: "100%",
    alignItems: "flex-end",
  },
  tabButton: {
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
    fontSize: "0.8rem",
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: "4px 4px 0 0",
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    transition: "all 0.15s ease",
  },
  activeTabButton: {
    color: "var(--accent-cyan)",
    borderBottom: "2px solid var(--accent-cyan)",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  outputBody: {
    flex: 1,
    padding: "16px",
    backgroundColor: "var(--bg-textarea)",
    overflowY: "auto" as const,
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    position: "relative" as const,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "var(--text-muted)",
    gap: "8px",
  },
  emptyIcon: {
    fontSize: "2rem",
    opacity: 0.6,
  },
  rawOutput: {
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
    color: "#38bdf8",
    lineHeight: "1.6",
  },
  errorOutput: {
    whiteSpace: "pre-wrap" as const,
    color: "#f87171",
    lineHeight: "1.6",
    margin: 0,
  },
  logTextMuted: {
    color: "var(--text-muted)",
    fontStyle: "italic",
  },
  errorContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  errorBanner: {
    backgroundColor: "rgba(244, 63, 94, 0.05)",
    border: "1px solid rgba(244, 63, 94, 0.15)",
    padding: "12px",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    alignItems: "flex-start",
  },
  detectionBanner: {
    backgroundColor: "rgba(245, 158, 11, 0.04)",
    border: "1px solid rgba(245, 158, 11, 0.15)",
    padding: "12px",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    alignItems: "flex-start",
  },
  sandboxBanner: {
    backgroundColor: "rgba(245, 158, 11, 0.04)",
    border: "1px solid rgba(245, 158, 11, 0.15)",
    padding: "14px",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    alignItems: "flex-start",
  },
  errorTitle: {
    color: "var(--text-main)",
    margin: 0,
    fontSize: "0.85rem",
    lineHeight: "1.5",
  },
  sandboxNote: {
    color: "var(--text-muted)",
    margin: 0,
    fontSize: "0.82rem",
    lineHeight: "1.5",
  },
  badgeRose: {
    fontSize: "0.7rem",
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    border: "1px solid rgba(244, 63, 94, 0.2)",
    color: "var(--accent-rose)",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: 600,
  },
  badgeAmber: {
    fontSize: "0.7rem",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.25)",
    color: "#f59e0b",
    padding: "2px 8px",
    borderRadius: "4px",
    fontWeight: 600,
  },
  outputContainer: {
    height: "100%",
  },
  rawSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
  },
  rawSectionLabel: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  friendlyCard: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    border: "1px solid rgba(16, 185, 129, 0.15)",
    borderRadius: "6px",
    padding: "10px 12px",
    marginTop: "4px",
  },
  friendlyIcon: {
    fontSize: "1.1rem",
    flexShrink: 0,
  },
  friendlyText: {
    margin: 0,
    color: "var(--text-main)",
    fontSize: "0.83rem",
    lineHeight: "1.55",
    fontFamily: "var(--font-sans)",
  },
  diagnosticsBanner: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
    padding: "6px 10px",
    backgroundColor: "rgba(244, 63, 94, 0.05)",
    border: "1px solid rgba(244, 63, 94, 0.12)",
    borderRadius: "6px",
  },
  diagnosticsLabel: {
    fontSize: "0.75rem",
    color: "#f87171",
    fontWeight: 600,
  },
  diagnosticsNote: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  metricsContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    maxWidth: "400px",
  },
  metricRow: {
    display: "flex",
    justifyContent: "space-between",
    borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
    paddingBottom: "8px",
  },
  metricLabel: {
    color: "var(--text-secondary)",
  },
  metricValue: {
    color: "var(--text-main)",
    fontWeight: 500,
  },
  metricValueGreen: {
    color: "var(--accent-green)",
    fontWeight: 600,
  },
  metricValueAmber: {
    color: "#f59e0b",
    fontWeight: 600,
  },
  metricValueRed: {
    color: "var(--accent-rose)",
    fontWeight: 600,
  },
  metricSectionHeader: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--accent-cyan)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "1px solid rgba(6, 182, 212, 0.15)",
    paddingBottom: "4px",
    marginBottom: "8px",
    marginTop: "16px",
  },
  reasonsContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    marginTop: "4px",
  },
  reasonsList: {
    margin: 0,
    paddingLeft: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  reasonItem: {
    fontSize: "0.8rem",
    color: "var(--text-secondary)",
    lineHeight: "1.4",
  },
};
