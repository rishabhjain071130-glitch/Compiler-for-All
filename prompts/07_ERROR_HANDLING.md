# Phase 7: Error Parsing & Friendly Formatting

## Objective
Implement compilation and runtime error parsers. Extract error lines, columns, and severity from compiler dump files, map these to Monaco Editor markers, and provide beginner-friendly explanations for common runtime crashes.

---

## Requirements
*   Create a backend parser utility `server/src/compiler/errorParser.ts` containing regex extraction rules for:
    *   **GCC / G++**: Match format `main\.cpp?:(\d+):(\d+):\s+(error|warning):\s+(.*)`.
    *   **Java**: Match format `([A-Za-z0-9_]+\.java):(\d+):\s+error:\s+(.*)`.
    *   **Python**: Match traceback formats: `File\s+["']main\.py["'],\s+line\s+(\d+)` and parse the trailing line for error names (e.g., `NameError`, `ZeroDivisionError`).
    *   **Node.js**: Match stack line formats: `main\.js:(\d+)(?::(\d+))?`.
*   Implement a "Friendly Translation Map" that maps cryptic errors to helpful descriptions:
    *   *Segmentation Fault (SIGSEGV)* -> "Segmentation Fault: Your program tried to access a memory block it doesn't own. Common causes: out-of-bound array access, dereferencing null/uninitialized pointers."
    *   *ZeroDivisionError / division by zero* -> "Arithmetic Error: Your code is trying to divide a number by zero, which is mathematically impossible."
    *   *NullPointerException* -> "Null Reference Error: Your code tried to use an object reference that points to nothing ('null'). Make sure to instantiate objects before calling methods."
    *   *IndexOutOfBoundsException* -> "Index Out of Bounds: You tried to access an item in an array using an index that is either negative or greater than the array's size."
*   Expose error markers to the frontend:
    *   Provide the `CompilerErrorResponse` payload as defined in [00_MASTER.md](file:///d:/Github/Compiler-for-All/prompts/00_MASTER.md) (containing `lineNum`, `columnNum`, `severity`, `message`, `friendlyMessage`, `status`, and `rawError`).
*   Integrate Monaco Editor markers:
    *   Bind parsed coordinates to Monaco using `monaco.editor.setModelMarkers` to draw inline red squiggly underlines on error sources.
    *   Clear markers automatically when the user edits the code buffer or re-runs execution.

---

## Technical Considerations
*   Ensure that file paths generated during temporary executions (e.g., `/usr/src/app/temp/uuid/main.py`) are sanitized and replaced with relative names (`main.py`).
*   The raw stderr stream must always remain accessible to the user in a collapsible panel to avoid withholding information from advanced users.

---

## Files/Components Expected
*   `server/src/compiler/errorParser.ts`: Regex engines, mapping functions, and translator dictionaries.
*   `client/src/components/EditorPane.tsx`: Monaco marker hook registry and cleanup routines.
*   `client/src/components/Console.tsx`: Tabbed view updating error panels and displaying the friendly translation cards.

---

## Acceptance Criteria
1.  Writing C code containing a missing semicolon triggers an error indicator showing a red squiggly underline on the specific line.
2.  Causing a division by zero error in Python renders a prominent, custom styled panel explaining the concept of dividing by zero in simple terms, alongside the raw traceback dump.
3.  Editing code in Monaco clears the error highlights instantly.

---

## Things the agent must not do
*   **DO NOT** hide raw error outputs. The compiler's raw message must be available for inspection.
*   **DO NOT** fail code executions when the regex parser fails to match. If a match is absent, return the raw error payload with `lineNum: null`.
