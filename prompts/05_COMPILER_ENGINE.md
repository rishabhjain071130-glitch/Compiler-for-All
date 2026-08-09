# Phase 5: Compiler Engine Configuration

## Objective

Establish the backend execution configuration schemas, routing modules, and CLI command generators. Implement a Java source parser to dynamically name Java files based on class declarations.

---

## Requirements

- Create a schema defining compilation and interpretation rules for each of the 5 supported languages:
  - **C**: File extension `.c`, compile command `gcc -O2 -std=c11 -Wall [source] -o [output]`, run command `./[output]`.
  - **C++**: File extension `.cpp`, compile command `g++ -O2 -std=c++17 -Wall [source] -o [output]`, run command `./[output]`.
  - **Java**: File extension `.java`, compile command `javac [source]`, run command `java [classname]`.
  - **Python**: File extension `.py`, run command `python3 [source]`.
  - **JavaScript**: File extension `.js`, run command `node [source]`.
- Implement a parser (`server/src/compiler/parser.ts`) specifically to extract the Java public class identifier:
  - Search the code buffer for `public\s+class\s+([A-Za-z0-9_]+)`.
  - If found, save the file as `[Classname].java` and execute it as `java [Classname]`.
  - If not found:
    - For **Java**: save the file as `Main.java` and execute as `java Main`.
    - For other languages: save the file as `main.[ext]`.
- Configure the backend execution endpoint `POST /api/execute`:
  - Authorize the request payload (code size <= 64KB, stdin size <= 16KB).
  - Run the authoritative detection module (`detectLanguage`).
  - Map the detected language to its configuration block, generating files, path arrays, and command parameters.

---

## Technical Considerations

- **Security Injection Prevention**: Commands must be formatted as argument lists (arrays) rather than raw shell strings to prevent command injection vulnerabilities.
- **Decoupled Design**: Keep the routing layer separated from the execution engine so the execution mechanism (local vs. sandboxed docker) can be swapped seamlessly in later phases.

---

## Files/Components Expected

- `server/src/compiler/config.ts`: Configuration mappings, flags, and typescript type boundaries.
- `server/src/compiler/parser.ts`: Java class-name extractor and file structure generator.
- `server/src/routes/execute.ts`: Exposes the endpoint, runs payload validations, and returns command maps.

---

## Acceptance Criteria

1.  Sending a `POST /api/execute` request with C++ code returns HTTP status `200` with JSON detailing:
    - `detectedLanguage: "cpp"`
    - `compilationCommand: ["g++", "-O2", "-std=c++17", ...]`
    - `executionCommand: ["./main"]`
2.  Sending Java code containing `public class BinarySearch` returns coordinates indicating the file will be mapped to `BinarySearch.java` and compiled.
3.  Empty, oversized, or invalid payloads return standard HTTP status `400` errors with informative JSON error messages.

---

## Things the agent must not do

- **DO NOT** run child processes or spawn compilers on the host OS yet.
- **DO NOT** set up Docker volumes or write temporary directories to the disk. Keep the routing mock-based for runtime outputs.
