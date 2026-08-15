interface ControlBarProps {
  detectedLanguage: string;
  confidence: number;
  executing: boolean;
  onRun: () => void;
}

export default function ControlBar({
  detectedLanguage,
  confidence,
  executing,
  onRun,
}: ControlBarProps) {
  // Determine if a language has been detected (not in "detecting" state)
  const isDetected = detectedLanguage.toLowerCase() !== "detecting..." && confidence > 0;

  return (
    <div
      style={styles.container}
      className="glass-panel"
      role="region"
      aria-label="Action Controls"
    >
      {/* Left side: Speculative language detection indicator */}
      <div style={styles.left}>
        <div
          style={{
            ...styles.pill,
            ...(isDetected ? styles.pillDetected : styles.pillDetecting),
          }}
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            style={{
              ...styles.pillDot,
              ...(isDetected ? styles.pillDotActive : styles.pillDotSearching),
            }}
            aria-hidden="true"
          ></span>
          <span style={styles.pillLabel}>Language:</span>
          <span style={styles.pillValue}>
            {detectedLanguage}
            {confidence > 0 ? ` (${Math.round(confidence * 100)}%)` : ""}
          </span>
        </div>
        <span style={styles.helpText}>No dropdown needed—just start writing code.</span>
      </div>

      {/* Right side: Execution trigger button */}
      <div style={styles.right}>
        <button
          type="button"
          onClick={onRun}
          disabled={executing}
          aria-label={executing ? "Executing code in sandbox" : "Run Code"}
          aria-busy={executing}
          style={{
            ...styles.runButton,
            ...(executing ? styles.runButtonDisabled : {}),
          }}
        >
          {executing ? (
            <>
              {/* Spinner */}
              <svg
                style={styles.spinner}
                className="animate-spin"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  style={styles.spinnerCircle}
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  style={styles.spinnerPath}
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Executing...</span>
            </>
          ) : (
            <>
              <span style={styles.playIcon} aria-hidden="true">
                ▶
              </span>
              <span>Run Code</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "56px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    borderRadius: "8px",
    marginTop: "12px",
    flexShrink: 0,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: 500,
    transition: "all 0.2s ease",
  },
  pillDetecting: {
    backgroundColor: "rgba(6, 182, 212, 0.06)",
    border: "1px solid rgba(6, 182, 212, 0.15)",
    color: "var(--accent-cyan)",
  },
  pillDetected: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    border: "1px solid rgba(16, 185, 129, 0.25)",
    color: "var(--accent-green)",
    boxShadow: "0 0 10px rgba(16, 185, 129, 0.05)",
  },
  pillDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
  },
  pillDotSearching: {
    backgroundColor: "var(--accent-cyan)",
    boxShadow: "0 0 6px var(--accent-cyan)",
    animation: "pulse-glow 1.5s infinite ease-in-out",
  },
  pillDotActive: {
    backgroundColor: "var(--accent-green)",
    boxShadow: "0 0 8px var(--accent-green)",
  },
  pillLabel: {
    opacity: 0.7,
  },
  pillValue: {
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  helpText: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    display: "inline-block",
  },
  right: {
    display: "flex",
  },
  runButton: {
    border: "none",
    outline: "none",
    backgroundColor: "var(--accent-cyan)",
    color: "#05070d",
    fontFamily: "var(--font-sans)",
    fontSize: "0.85rem",
    fontWeight: 700,
    letterSpacing: "0.025em",
    padding: "8px 20px",
    borderRadius: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow: "0 0 12px rgba(6, 182, 212, 0.3)",
  },
  runButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    color: "var(--text-muted)",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  playIcon: {
    fontSize: "0.75rem",
  },
  spinner: {
    width: "14px",
    height: "14px",
    color: "var(--text-muted)",
  },
  spinnerCircle: {
    opacity: 0.25,
  },
  spinnerPath: {
    opacity: 0.75,
  },
};
