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

interface ConsoleProps {
  stdin: string;
  onChangeStdin: (val: string) => void;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  result: ExecutionResult | null;
  executing: boolean;
}

export default function Console({
  stdin,
  onChangeStdin,
  activeTab,
  onChangeTab,
  result,
  executing,
}: ConsoleProps) {
  // Render active output stream
  const renderOutput = () => {
    if (executing) {
      return <div style={styles.logTextMuted}>Executing sandboxed environment...</div>;
    }

    if (!result || result.status === null) {
      return (
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>📭</span>
          <span>Click "Run Code" to view execution output.</span>
        </div>
      );
    }

    switch (activeTab) {
      case "output":
        if (result.status === "compilation_error") {
          return (
            <div style={styles.errorBanner}>
              <span style={styles.badgeRose}>Compilation Failed</span>
              <p style={styles.errorTitle}>
                The compiler encountered an error. Check the "Compiler Output" tab for details.
              </p>
            </div>
          );
        }
        if (result.status === "timeout") {
          return (
            <div style={styles.errorBanner}>
              <span style={styles.badgeRose}>Timeout Limit Exceeded</span>
              <p style={styles.errorTitle}>
                Your code exceeded the execution limit (5 seconds). Check for infinite loops.
              </p>
            </div>
          );
        }
        if (result.status === "resource_limit_exceeded") {
          return (
            <div style={styles.errorBanner}>
              <span style={styles.badgeRose}>Resource Limit Exceeded</span>
              <p style={styles.errorTitle}>
                Your code exceeded memory limits (64MB) and was terminated by the sandbox.
              </p>
            </div>
          );
        }
        if (result.status === "runtime_error") {
          return (
            <div style={styles.errorContainer}>
              <span style={styles.badgeRose}>Runtime Error</span>
              <pre style={styles.rawOutput}>
                {result.stderr || "Process terminated abnormally."}
              </pre>
            </div>
          );
        }
        return (
          <div style={styles.outputContainer}>
            {result.stdout ? (
              <pre style={styles.rawOutput}>{result.stdout}</pre>
            ) : (
              <div style={styles.logTextMuted}>
                Program executed successfully but returned no output.
              </div>
            )}
          </div>
        );

      case "compiler":
        return (
          <div style={styles.outputContainer}>
            {result.stderr ? (
              <pre style={result.status === "success" ? styles.warningOutput : styles.errorOutput}>
                {result.stderr}
              </pre>
            ) : (
              <div style={styles.logTextMuted}>No compiler errors or warnings logged.</div>
            )}
          </div>
        );

      case "metrics":
        return (
          <div style={styles.metricsContainer}>
            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Sandbox Status:</span>
              <span
                style={
                  result.status === "success" ? styles.metricValueGreen : styles.metricValueRed
                }
              >
                {result.status?.toUpperCase() || "IDLE"}
              </span>
            </div>
            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Execution Duration:</span>
              <span style={styles.metricValue}>
                {result.timeMs !== null ? `${result.timeMs} ms` : "N/A"}
              </span>
            </div>
            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Process Exit Code:</span>
              <span style={styles.metricValue}>
                {result.exitCode !== null ? result.exitCode : "N/A"}
              </span>
            </div>
            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Memory Resource Pool:</span>
              <span style={styles.metricValue}>64 MB Limit (Isolated)</span>
            </div>
            <div style={styles.metricRow}>
              <span style={styles.metricLabel}>Sandbox Runtime:</span>
              <span style={styles.metricValue}>gVisor Kernel Sandbox</span>
            </div>
          </div>
        );

      default:
        return null;
    }
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
  warningOutput: {
    whiteSpace: "pre-wrap" as const,
    color: "var(--accent-amber)",
    lineHeight: "1.6",
  },
  errorOutput: {
    whiteSpace: "pre-wrap" as const,
    color: "#f87171",
    lineHeight: "1.6",
  },
  logTextMuted: {
    color: "var(--text-muted)",
    fontStyle: "italic",
  },
  errorContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
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
  errorTitle: {
    color: "var(--text-main)",
    margin: 0,
    fontSize: "0.85rem",
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
  outputContainer: {
    height: "100%",
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
  metricValueRed: {
    color: "var(--accent-rose)",
    fontWeight: 600,
  },
};
