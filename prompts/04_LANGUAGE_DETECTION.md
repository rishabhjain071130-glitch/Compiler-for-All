# Phase 4: Language Detection Engine

## Objective

Implement the multi-signal language detection engine as a shared TypeScript utility. Write comprehensive unit tests containing standard code snippets, edge cases, and mixed constructs to guarantee accuracy.

---

## Requirements

- Create a shared utility `shared/detector.ts` containing the detection engine.
- Implement code pre-processing:
  - Strip single-line and multi-line comments for all 5 target syntaxes (`//`, `/* */`, `#`).
  - Strip double/single-quoted string literals to ignore keywords inside string outputs.
- Implement heuristic scoring algorithms matching the specifications detailed in [LANGUAGE_RULES.md](file:///d:/Github/Compiler-for-All/docs/LANGUAGE_RULES.md).
- Add tie-breaking controls:
  - Penalize Python scoring if statement-ending semicolons (`;`) are present.
  - Penalize C, C++, Java, and JS scoring if curly braces (`{}`) are absent.
- Expose a simple function API:
  ```typescript
  export function detectLanguage(code: string): { language: string; confidence: number };
  ```
- Write unit tests using a testing framework (e.g. `Vitest` or `Jest`) coverage testing:
  - Include at least 5 standard code snippets for each language (HelloWorld, Fibonacci, BubbleSort, API fetching, File read/writes).
  - Include edge-case snippets (empty strings, single comments, heavily nested logic).

---

## Technical Considerations

- **Performance**: The detection must resolve in less than 5ms under standard conditions (code buffers up to 64KB) to avoid blocking main loops.
- **ReDoS Prevention**: Avoid greedy or nested quantifiers in regular expressions to eliminate the risk of Regular Expression Denial of Service.
- **Zero-dependency**: The detector must be written in pure TypeScript without importing third-party NLP or classifier libraries.

---

## Files/Components Expected

- `shared/detector.ts`: Pure TypeScript scoring logic, exports `detectLanguage`.
- `shared/detector.test.ts`: Test suites containing snippet arrays and validation assertions.
- `client/src/components/EditorPane.tsx`: Connects Monaco to the real `shared/detector.ts` engine via the state hook.

---

## Acceptance Criteria

1.  Running `npm run test:shared` executes all unit tests in the shared directory.
2.  Language detection accuracy is >= 98% across standard, valid code patterns of C, C++, Java, Python, and JavaScript.
3.  The frontend auto-detect pill updates instantly in real-time as the user types (with the 500ms debounce buffer).
4.  Invalid or completely unidentifiable code snippets fall back gracefully to a designated default value (JavaScript) with 0% confidence.

---

## Things the agent must not do

- **DO NOT** import heavy parser tools (e.g. Babel, Esprima, tree-sitter) or external AI models.
- **DO NOT** execute any user code during detection. The engine is strictly static.
- **DO NOT** write code for spawning container sandbox environments yet.
