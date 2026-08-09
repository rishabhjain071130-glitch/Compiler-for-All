# Phase 3: Monaco Code Editor Integration

## Objective
Replace the styled `<textarea>` placeholder with a fully-configured Monaco Code Editor. Bind editor states, setup auto-resize handlers, apply themes, and establish speculative language highlighting routines.

---

## Requirements
*   Install `@monaco-editor/react` as a client dependency.
*   Configure Monaco Editor with parameters optimal for coding exercises:
    *   `minimap: { enabled: false }`
    *   `wordWrap: "on"`
    *   `fontSize: 14`
    *   `lineNumbers: "on"`
    *   `automaticLayout: true` (auto-resize with split panes)
    *   `tabSize: 4`
*   Create a custom Monaco theme configuration that blends with the CSS glassmorphism theme variables designed in Phase 2.
*   Implement a debounce mechanism (500ms) to update the parent component's code string state.
*   Support dynamic, seamless transitions of syntax highlighting without re-instantiating the Monaco instance (use `monaco.editor.setModelLanguage`).
*   Track and preserve cursor position and scroll positions when updating the code model language.

---

## Technical Considerations
*   Monaco loading states should be handled gracefully using a clean CSS loading skeleton or spinner inside the editor frame.
*   Ensure that event listeners (e.g. key listeners, model changes) are properly cleaned up upon component unmount to prevent severe browser memory leaks.

---

## Files/Components Expected
*   `client/src/components/EditorPane.tsx`: Integrates the Monaco React component, handles theme overrides, loading states, and registers cleanup hooks.
*   `client/src/hooks/useDebounce.ts`: Custom hook to optimize state change frequencies.

---

## Acceptance Criteria
1.  Monaco Editor loads within the layout, adjusting its boundaries cleanly when the browser is resized.
2.  Typing in Monaco updates the shared state variables after a 500ms pause.
3.  The cursor position remains active, and scroll position does not reset when changing languages programmatically.
4.  No memory leaks occur when swapping between active views or repeatedly rendering the editor pane.

---

## Things the agent must not do
*   **DO NOT** write the full, multi-signal language detection engine yet. Use simple mock keyphrase listeners (e.g. mapping `import ` to `python`, `cout` to `cpp`, `console.log` to `javascript`) to test the editor's syntax highlighting updates.
*   **DO NOT** write code execution compilation steps on the backend.
*   **DO NOT** block editor main thread input loops with intensive synchronous computation.
