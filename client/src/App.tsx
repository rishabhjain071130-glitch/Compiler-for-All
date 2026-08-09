import { useState, useEffect } from "react";

interface HealthStatus {
  status: string;
  timestamp: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health");
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data: HealthStatus = await res.json();
      setHealth(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Compiler for All</h1>
        <p style={styles.subtitle}>Phase 1: Project Setup & Foundation</p>
      </header>
      <main style={styles.card}>
        <h2 style={styles.cardTitle}>Backend Status Connection</h2>
        {loading && <p style={styles.status}>Checking connection...</p>}
        {error && (
          <div style={styles.errorContainer}>
            <p style={styles.errorText}>Connection Error: {error}</p>
            <button onClick={fetchHealth} style={styles.button}>
              Retry Connection
            </button>
          </div>
        )}
        {health && (
          <div style={styles.successContainer}>
            <div style={styles.statusIndicator}>
              <span style={styles.dot}></span>
              <p style={styles.statusText}>Backend Connected Successfully</p>
            </div>
            <pre style={styles.rawOutput}>{JSON.stringify(health, null, 2)}</pre>
            <button onClick={fetchHealth} style={styles.button}>
              Refresh Status
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'Inter', sans-serif",
    backgroundColor: "#0d0e12",
    color: "#e2e8f0",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "30px",
  },
  title: {
    fontSize: "2.5rem",
    fontWeight: 700,
    background: "linear-gradient(90deg, #10b981, #06b6d4)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: "0 0 10px 0",
  },
  subtitle: {
    fontSize: "1rem",
    color: "#94a3b8",
    margin: 0,
  },
  card: {
    backgroundColor: "rgba(30, 41, 59, 0.4)",
    backdropFilter: "blur(12px)",
    borderRadius: "16px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    padding: "30px",
    width: "100%",
    maxWidth: "500px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
  },
  cardTitle: {
    fontSize: "1.25rem",
    margin: "0 0 20px 0",
    fontWeight: 600,
  },
  status: {
    color: "#60a5fa",
  },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "20px",
  },
  errorText: {
    color: "#f87171",
    margin: "0 0 15px 0",
    fontSize: "0.9rem",
  },
  successContainer: {
    display: "flex",
    flexDirection: "column" as const,
  },
  statusIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "15px",
  },
  dot: {
    width: "10px",
    height: "10px",
    backgroundColor: "#10b981",
    borderRadius: "50%",
    boxShadow: "0 0 8px #10b981",
  },
  statusText: {
    color: "#34d399",
    margin: 0,
    fontSize: "0.95rem",
    fontWeight: 500,
  },
  rawOutput: {
    backgroundColor: "#090d16",
    padding: "15px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.03)",
    fontSize: "0.85rem",
    fontFamily: "'Fira Code', monospace",
    color: "#38bdf8",
    overflowX: "auto" as const,
    margin: "0 0 20px 0",
  },
  button: {
    fontFamily: "inherit",
    fontWeight: 500,
    fontSize: "0.9rem",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#ffffff",
    padding: "10px 20px",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    alignSelf: "flex-start",
  },
};
