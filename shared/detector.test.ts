import { describe, it, expect } from "vitest";
import { detectLanguage, preprocessCode } from "./detector.ts";

describe("Language Detection Engine Preprocessing", () => {
  it("strips comments and string literals correctly", () => {
    const rawCode = `
      // Single line comment
      /* Multi-line
         comment */
      const msg = "Hello World";
      # Python comment here
      console.log(msg);
    `;
    const clean = preprocessCode(rawCode);
    expect(clean).not.toContain("Single line comment");
    expect(clean).not.toContain("Multi-line");
    expect(clean).not.toContain("Hello World");
    expect(clean).not.toContain("Python comment here");
    expect(clean).toContain("console.log");
  });

  it("does not strip C/C++ preprocessors containing #", () => {
    const code = `
      #include <stdio.h>
      #define MAX_VAL 100
      // normal comment
    `;
    const clean = preprocessCode(code);
    expect(clean).toContain("#include <stdio.h>");
    expect(clean).toContain("#define MAX_VAL 100");
  });
});

describe("Language Detection Heuristics", () => {
  // 1. C snippets
  it("detects C code", () => {
    const code1 = `
      #include <stdio.h>
      #include <stdlib.h>
      
      int main() {
          printf("Hello, C compiler!\\n");
          int *arr = (int*)malloc(10 * sizeof(int));
          free(arr);
          return 0;
      }
    `;
    const res = detectLanguage(code1);
    expect(res.language).toBe("C");
    expect(res.confidence).toBeGreaterThan(0.7);
    expect(
      res.reasons.some((r) => r.includes("stdio.h") || r.includes("printf") || r.includes("malloc"))
    ).toBe(true);
  });

  // 2. C++ snippets
  it("detects C++ code", () => {
    const code1 = `
      #include <iostream>
      #include <vector>
      using namespace std;
      
      int main() {
          vector<int> nums = {1, 2, 3};
          cout << "Hello C++" << endl;
          return 0;
      }
    `;
    const res = detectLanguage(code1);
    expect(res.language).toBe("C++");
    expect(res.confidence).toBeGreaterThan(0.7);
    expect(
      res.reasons.some(
        (r) => r.includes("iostream") || r.includes("cout") || r.includes("namespace std")
      )
    ).toBe(true);
  });

  // 3. Java snippets
  it("detects Java code", () => {
    const code = `
      import java.util.ArrayList;
      
      public class Solution {
          public static void main(String[] args) {
              System.out.println("Java execution test");
          }
      }
    `;
    const res = detectLanguage(code);
    expect(res.language).toBe("Java");
    expect(res.confidence).toBeGreaterThan(0.7);
    expect(
      res.reasons.some(
        (r) => r.includes("public class") || r.includes("main") || r.includes("System.out")
      )
    ).toBe(true);
  });

  // 4. Python snippets
  it("detects Python code", () => {
    const code = `
      import os
      
      def calculate_sum(numbers):
          total = 0
          for n in numbers:
              total += n
          return total
          
      if __name__ == '__main__':
          print(calculate_sum([1, 2, 3]))
    `;
    const res = detectLanguage(code);
    expect(res.language).toBe("Python");
    expect(res.confidence).toBeGreaterThan(0.7);
    expect(res.reasons.some((r) => r.includes("def") || r.includes("__name__"))).toBe(true);
  });

  // 5. JavaScript snippets
  it("detects JavaScript code", () => {
    const code = `
      const fs = require("fs");
      let count = 10;
      
      const processItems = async () => {
          console.log("processing: " + count);
      };
      
      processItems();
    `;
    const res = detectLanguage(code);
    expect(res.language).toBe("JavaScript");
    expect(res.confidence).toBeGreaterThan(0.7);
    expect(
      res.reasons.some(
        (r) => r.includes("console.log") || r.includes("require") || r.includes("let")
      )
    ).toBe(true);
  });

  // 6. C vs C++ distinction check
  it("distinguishes C vs C++ correctly", () => {
    const cCode = `
      #include <stdio.h>
      int main() {
          printf("hello");
          return 0;
      }
    `;
    const cppCode = `
      #include <iostream>
      int main() {
          std::cout << "hello";
          return 0;
      }
    `;
    expect(detectLanguage(cCode).language).toBe("C");
    expect(detectLanguage(cppCode).language).toBe("C++");
  });

  // 7. Empty code checks
  it("resolves empty inputs gracefully", () => {
    const res = detectLanguage("");
    expect(res.language).toBe("JavaScript");
    expect(res.confidence).toBe(0);
    expect(res.reasons[0]).toContain("Empty code");
  });

  // 8. Comments-only inputs
  it("resolves comments-only code gracefully", () => {
    const res = detectLanguage("// just some c-style comment line\\n/* block comment */");
    expect(res.language).toBe("JavaScript");
    expect(res.confidence).toBe(0);
  });

  // 9. Conflicting signals / Low confidence
  it("penalizes Python for semicolons and non-Python for lack of braces", () => {
    // Semicolon penalty: Python print with semicolons gets cut
    const semiPython = `
      print("Python style, but has semicolons");;
    `;
    const res = detectLanguage(semiPython);
    // Since print matches Python rules but has semicolons, pythonScore gets divided.
    // It should still default or have very low confidence
    expect(res.confidence).toBeLessThan(0.5);

    // Braces penalty: C code but without any braces
    const braceLessC = `
      #include <stdio.h>
      printf("no braces");
    `;
    const resC = detectLanguage(braceLessC);
    expect(
      resC.reasons.some((r) => r.includes("heavily penalized due to missing curly braces"))
    ).toBe(true);
  });

  // 10. Ambiguous tie breaker
  it("handles ties or close margins with low confidence", () => {
    const tieCode = `
      #include <stdio.h>
      cout << "hello";
    `;
    const res = detectLanguage(tieCode);
    expect(res.confidence).toBeLessThan(0.6);
  });
});
