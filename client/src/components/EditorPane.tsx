import { useRef, useEffect, useState } from "react";
import Editor, { Monaco, OnMount } from "@monaco-editor/react";
import { useDebounce } from "../hooks/useDebounce.ts";

interface EditorPaneProps {
  code: string;
  onChangeCode: (val: string) => void;
  detectedLanguage: string;
}

export default function EditorPane({ code, onChangeCode, detectedLanguage }: EditorPaneProps) {
  const [localCode, setLocalCode] = useState<string>(code);
  const debouncedLocalCode = useDebounce(localCode, 500);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  // Sync parent updates (e.g., initial load, resets)
  useEffect(() => {
    if (code !== localCode) {
      setLocalCode(code);
    }
  }, [code]);

  // Propagate debounced changes to the parent state
  useEffect(() => {
    onChangeCode(debouncedLocalCode);
  }, [debouncedLocalCode]);

  // Map visual status pill value to Monaco language IDs
  const mapLanguage = (lang: string): string => {
    const normalized = lang.toLowerCase();
    if (normalized.includes("c++") || normalized.includes("cpp")) return "cpp";
    if (normalized.includes("java")) return "java";
    if (normalized.includes("python")) return "python";
    if (normalized.includes("javascript") || normalized.includes("js")) return "javascript";
    if (normalized === "c") return "c";
    return "javascript"; // fallback
  };

  // Sync model language dynamically when detectedLanguage updates
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const langId = mapLanguage(detectedLanguage);
        monacoRef.current.editor.setModelLanguage(model, langId);
      }
    }
  }, [detectedLanguage]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom slate-dark/cyan editor theme matching glassmorphic panel variables
    monaco.editor.defineTheme("compilerForAllTheme", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "f1f5f9" },
        { token: "comment", foreground: "64748b", fontStyle: "italic" },
        { token: "keyword", foreground: "06b6d4", fontStyle: "bold" },
        { token: "string", foreground: "10b981" },
        { token: "number", foreground: "f59e0b" },
      ],
      colors: {
        "editor.background": "#090d16",
        "editor.foreground": "#f1f5f9",
        "editorLineNumber.foreground": "#475569",
        "editorLineNumber.activeForeground": "#06b6d4",
        "editor.lineHighlightBackground": "#131b2e",
        "editorCursor.foreground": "#06b6d4",
        "editor.selectionBackground": "rgba(6, 182, 212, 0.15)",
        "editor.inactiveSelectionBackground": "rgba(6, 182, 212, 0.08)",
      },
    });

    monaco.editor.setTheme("compilerForAllTheme");
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setLocalCode(value);
    }
  };

  return (
    <div style={styles.container} className="glass-panel">
      <div style={styles.header}>
        <span style={styles.title}>Source Editor</span>
        <span style={styles.badge}>Monaco Sandbox Active</span>
      </div>

      <div style={styles.editorBody}>
        <Editor
          height="100%"
          language={mapLanguage(detectedLanguage)}
          value={localCode}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          loading={
            <div style={styles.skeletonContainer}>
              <div style={styles.skeletonPulse}>Loading Editor Sandbox...</div>
            </div>
          }
          options={{
            minimap: { enabled: false },
            wordWrap: "on",
            fontSize: 14,
            lineNumbers: "on",
            automaticLayout: true,
            tabSize: 4,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            padding: { top: 16, bottom: 16 },
            fontFamily: "var(--font-mono)",
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    overflow: "hidden",
  },
  header: {
    height: "40px",
    borderBottom: "1px solid var(--border-color)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    flexShrink: 0,
  },
  title: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  },
  badge: {
    fontSize: "0.7rem",
    backgroundColor: "rgba(6, 182, 212, 0.08)",
    border: "1px solid rgba(6, 182, 212, 0.15)",
    color: "var(--accent-cyan)",
    padding: "2px 8px",
    borderRadius: "4px",
    fontWeight: 500,
  },
  editorBody: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#090d16",
  },
  skeletonContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-sans)",
    fontSize: "0.9rem",
    backgroundColor: "#090d16",
  },
  skeletonPulse: {
    animation: "pulse-glow 1.5s infinite ease-in-out",
  },
};
