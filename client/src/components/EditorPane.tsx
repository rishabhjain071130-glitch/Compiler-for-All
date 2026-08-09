import { useRef } from "react";

interface EditorPaneProps {
  code: string;
  onChangeCode: (val: string) => void;
}

export default function EditorPane({ code, onChangeCode }: EditorPaneProps) {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize line numbers scroll with textarea scroll
  const handleScroll = () => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Generate line numbers array
  const lines = code.split("\n");
  const lineNumbers = Array.from({ length: Math.max(lines.length, 1) }, (_, i) => i + 1);

  return (
    <div style={styles.container} className="glass-panel">
      <div style={styles.header}>
        <span style={styles.title}>Source Editor</span>
        <span style={styles.badge}>Speculative Highlight Active</span>
      </div>

      <div style={styles.editorBody}>
        {/* Line Numbers Column */}
        <div style={styles.lineNumbers} ref={lineNumbersRef}>
          {lineNumbers.map((num) => (
            <div key={num} style={styles.lineNumber}>
              {num}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onChangeCode(e.target.value)}
          onScroll={handleScroll}
          placeholder='// Start typing your code here...&#10;// No need to select a language! The compiler will detect it.&#10;&#10;#include <stdio.h>&#10;int main() {&#10;    printf("Hello, World!\\n");&#10;    return 0;&#10;}'
          style={styles.textarea}
          spellCheck={false}
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
    display: "flex",
    flex: 1,
    overflow: "hidden",
    position: "relative" as const,
    backgroundColor: "var(--bg-textarea)",
  },
  lineNumbers: {
    width: "48px",
    padding: "16px 0",
    borderRight: "1px solid var(--border-color)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    overflow: "hidden",
    userSelect: "none" as const,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    lineHeight: "20px",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  lineNumber: {
    height: "20px",
    width: "100%",
    textAlign: "right" as const,
    paddingRight: "12px",
  },
  textarea: {
    flex: 1,
    border: "none",
    outline: "none",
    resize: "none" as const,
    backgroundColor: "transparent",
    color: "var(--text-main)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.9rem",
    lineHeight: "20px",
    padding: "16px",
    whiteSpace: "pre" as const,
    overflow: "auto" as const,
    tabSize: 4,
  },
};
