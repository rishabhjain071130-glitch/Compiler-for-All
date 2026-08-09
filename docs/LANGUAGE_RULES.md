# Language Detection Rules: Compiler for All

This document details the multi-signal heuristic scoring system used to determine whether user code is written in C, C++, Java, Python, or JavaScript.

---

## 1. Detection Process

To ensure robust detection and prevent false positives (such as a python print statement inside a JS string literal), the code buffer is processed through three steps:

```
[Raw User Code] 
       │
       ▼
1. Pre-processing ────► Strips comments (single & multi-line) and string literals.
       │
       ▼
2. Signal Analysis ───► Scans text for imports, structures, keywords, and syntax markers.
       │
       ▼
3. Score Resolving ──► Resolves weights, evaluates ties, and determines the target language.
```

---

## 2. Multi-Signal Rules Table

Each detected signal adds points to the corresponding language's score pool.

| Language | Signal Type | Pattern / RegEx / Text | Score Weight | Description |
| :--- | :--- | :--- | :--- | :--- |
| **C** | Strong | `#include\s*<[a-z]+\.h>` | **15** | Standard C headers like `<stdio.h>`, `<stdlib.h>`. |
| | Strong | `printf\s*\(\s*"` | **10** | Standard formatted output call. |
| | Medium | `scanf\s*\(` | **8** | Standard input call. |
| | Medium | `\bmalloc\s*\(` or `\bfree\s*\(` | **8** | Dynamic memory allocation primitives. |
| | Weak | `struct\s+[A-Za-z_][A-Za-z0-9_]*` | **4** | Structure definitions (common to C and C++). |
| **C++** | Strong | `#include\s*<[a-z]+>` (no `.h`) | **15** | C++ Standard library headers (e.g., `<iostream>`, `<vector>`). |
| | Strong | `cout\s*<<` or `cin\s*>>` | **15** | Standard streams I/O. |
| | Strong | `std::[a-z]+` | **12** | Namespace identifier prefix. |
| | Medium | `using\s+namespace\s+std;` | **10** | C++ namespace shortcut. |
| | Medium | `vector\s*<` or `map\s*<` | **10** | Template containers. |
| | Weak | `new\s+[A-Za-z0-9_]+` | **3** | Dynamic object instantiation. |
| **Java** | Strong | `public\s+class\s+[A-Za-z_]` | **15** | Class declaration block. |
| | Strong | `public\s+static\s+void\s+main`| **15** | Entry point signature. |
| | Strong | `System\.out\.print(ln)?\s*\(` | **12** | Standard console stream write. |
| | Medium | `import\s+java\.[a-z\.]+;` | **10** | Standard platform imports. |
| | Medium | `String\s*\[\s*\]\s+args` | **8** | Entry point arguments format. |
| **Python** | Strong | `def\s+[a-z_][a-z0-9_]*\s*\(.*?\)\s*:`| **15** | Function declaration with trailing colon. |
| | Strong | `if\s+__name__\s*==\s*['"]__main__['"]\s*:`| **15** | Script entry point block definition. |
| | Strong | `elif\s+.*?:` | **12** | Distinctive conditional clause. |
| | Medium | `import\s+[a-z_]` or `from\s+[a-z_]` | **8** | Module loading syntax. |
| | Medium | `print\s*\(.*?\)` (no trailing `;`) | **8** | Print call (without semicolon syntax). |
| | Weak | `None`, `True`, `False` | **3** | Capitalized boolean/null literals. |
| **JS** | Strong | `console\.log\s*\(` | **12** | Node/browser logging API. |
| | Strong | `require\s*\(\s*['"].*?['"]\s*\)` | **12** | CommonJS import signal. |
| | Medium | `const\s+.*?\s*=\s*require\(` | **10** | Module assignment syntax. |
| | Medium | `let\s+` or `var\s+` | **8** | Variable declarations (excluding `const` to avoid false positives in C/C++). |
| | Medium | `async\s+function` or `=>` | **8** | Modern asynchronous/arrow function layouts. |
| | Weak | `typeof\s+`, `undefined` | **5** | Type querying and value primitives. |

---

## 3. Resolving Ties & Edge Cases

*   **Semicolon Count**:
    *   C, C++, Java, and JavaScript codebase samples frequently end statements with semicolons (`;`).
    *   Python does not use semicolons. If the code contains semicolons at the end of statement lines, the Python score is instantly penalized (divided by 2).
*   **Brace Count**:
    *   C, C++, Java, and JS use matching curly braces `{}` to define code blocks.
    *   Python uses indentation. If there are no curly braces in the entire codebase file, the non-Python scores are heavily penalized.
*   **Fallback Default**:
    *   If no scores are accumulated, the system defaults to **JavaScript** for syntax highlighting.
    *   The run button displays a "Please specify language or write valid syntax" error warning if the score resolver returns an execution confidence level below 10%.
