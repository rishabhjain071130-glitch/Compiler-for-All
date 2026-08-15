export default function Navbar() {
  return (
    <header role="banner">
      <nav style={styles.nav} className="glass-panel" aria-label="Main Navigation">
        <div style={styles.left}>
          <div style={styles.logoContainer}>
            <span style={styles.logoIcon} aria-hidden="true">
              &lt;/&gt;
            </span>
            <span style={styles.logoText}>Compiler for All</span>
          </div>
          <span style={styles.divider} aria-hidden="true">
            |
          </span>
          <span style={styles.tagline}>Auto-Detecting Sandbox Editor</span>
        </div>
        <div style={styles.right}>
          <div style={styles.statusGroup} role="status" aria-label="Execution Engine Status">
            <span style={styles.statusDot} aria-hidden="true"></span>
            <span style={styles.statusText}>Cloud Sandbox Active</span>
          </div>
        </div>
      </nav>
    </header>
  );
}

const styles = {
  nav: {
    height: "56px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    borderRadius: "8px",
    marginBottom: "12px",
    flexShrink: 0,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  logoIcon: {
    fontFamily: "var(--font-mono)",
    fontWeight: "bold",
    color: "var(--accent-cyan)",
    fontSize: "1.1rem",
  },
  logoText: {
    fontWeight: 700,
    fontSize: "1.1rem",
    letterSpacing: "-0.025em",
  },
  divider: {
    color: "var(--text-muted)",
    opacity: 0.5,
  },
  tagline: {
    fontSize: "0.85rem",
    color: "var(--text-secondary)",
  },
  right: {
    display: "flex",
    alignItems: "center",
  },
  statusGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    border: "1px solid rgba(16, 185, 129, 0.15)",
    padding: "4px 10px",
    borderRadius: "16px",
  },
  statusDot: {
    width: "6px",
    height: "6px",
    backgroundColor: "var(--accent-green)",
    borderRadius: "50%",
    boxShadow: "0 0 6px var(--accent-green)",
  },
  statusText: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--accent-green)",
  },
};
