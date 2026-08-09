export interface DetectionResult {
  language: string;
  confidence: number;
  reasons: string[];
}

interface LanguageRule {
  pattern: RegExp;
  weight: number;
  description: string;
}

const C_RULES: LanguageRule[] = [
  {
    pattern: /#include\s*<[a-z_][a-z0-9_]*\.h>/i,
    weight: 15,
    description: "C Standard Header include (e.g. <stdio.h>)",
  },
  { pattern: /\bprintf\s*\(/, weight: 10, description: "Standard printf output function" },
  { pattern: /\bscanf\s*\(/, weight: 8, description: "Standard scanf input function" },
  {
    pattern: /\b(malloc|free)\s*\(/,
    weight: 8,
    description: "Dynamic memory allocation primitives (malloc/free)",
  },
  {
    pattern: /\bstruct\s+[A-Za-z_][A-Za-z0-9_]*/,
    weight: 4,
    description: "C-style struct declaration",
  },
];

const CPP_RULES: LanguageRule[] = [
  {
    pattern: /#include\s*<[a-z_][a-z0-9_]*>/i,
    weight: 15,
    description: "C++ Standard Header include (e.g. <iostream>)",
  },
  {
    pattern: /\b(cout\s*<<|cin\s*>>)/,
    weight: 15,
    description: "C++ Standard stream I/O (cout/cin)",
  },
  { pattern: /\bstd::[a-z_]+/i, weight: 12, description: "std namespace resolution operator" },
  {
    pattern: /\busing\s+namespace\s+std\s*;/,
    weight: 10,
    description: "using namespace std clause",
  },
  {
    pattern: /\b(vector|map|set|list|unordered_map)\s*</,
    weight: 10,
    description: "C++ template container type (STL)",
  },
  {
    pattern: /\bnew\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/,
    weight: 3,
    description: "C++ new operator instantiation",
  },
];

const JAVA_RULES: LanguageRule[] = [
  {
    pattern: /\bpublic\s+class\s+[A-Za-z_][A-Za-z0-9_]*/,
    weight: 15,
    description: "Java public class declaration block",
  },
  {
    pattern: /\bpublic\s+static\s+void\s+main\b/,
    weight: 15,
    description: "Java entry point method signature",
  },
  {
    pattern: /System\.out\.print(ln)?\s*\(/,
    weight: 12,
    description: "System.out.println output stream",
  },
  {
    pattern: /\bimport\s+java\.[a-z0-9_.]+\s*;/,
    weight: 10,
    description: "Java package import statement",
  },
  {
    pattern: /String\s*\[\s*\]\s+[A-Za-z_]/,
    weight: 8,
    description: "Java main String[] args array syntax",
  },
];

const PYTHON_RULES: LanguageRule[] = [
  {
    pattern: /\bdef\s+[a-z_][a-z0-9_]*\s*\([^)]*\)\s*:/,
    weight: 15,
    description: "Python function def block with colon",
  },
  {
    pattern: /\bif\s+__name__\s*==\s*""\s*:/,
    weight: 15,
    description: "Python script main execution block",
  },
  { pattern: /\belif\s+.*?:/, weight: 12, description: "Python elif conditional statement" },
  {
    pattern: /\b(import\s+[a-z_][a-z0-9_]*|from\s+[a-z_][a-z0-9_]*\s+import)/i,
    weight: 8,
    description: "Python library import syntax",
  },
  {
    pattern: /\bprint\s*\([^)]*\)(?!\s*;)/,
    weight: 8,
    description: "Python print call without statement semicolon",
  },
  {
    pattern: /\b(None|True|False)\b/,
    weight: 3,
    description: "Python capitalized Boolean/None literal",
  },
];

const JS_RULES: LanguageRule[] = [
  {
    pattern: /console\.log\s*\(/,
    weight: 12,
    description: "JavaScript console.log logging utility",
  },
  {
    pattern: /\brequire\s*\(\s*""\s*\)/,
    weight: 12,
    description: "CommonJS require module loading",
  },
  {
    pattern: /\bconst\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*require\s*\(/,
    weight: 10,
    description: "CommonJS require variable binding",
  },
  { pattern: /\b(let|var)\b/, weight: 8, description: "JavaScript let/var scope declarations" },
  {
    pattern: /(\basync\s+function|=>)/,
    weight: 8,
    description: "JavaScript async function or arrow operator",
  },
  {
    pattern: /\b(typeof\s+|undefined\b)/,
    weight: 5,
    description: "JavaScript typeof query or undefined literal",
  },
];

/**
 * Preprocesses code by removing string literals and comments to avoid matching text contents.
 */
export function preprocessCode(code: string): string {
  // 1. Strip string literals (double, single, backticks) to ignore prints/log strings
  let clean = code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""');

  // 2. Strip C-style comments (// and /* */)
  clean = clean.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  // 3. Strip Python comments (#) but preserve C/C++ preprocessors
  const lines = clean.split("\n");
  const processedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("#include") ||
      trimmed.startsWith("#define") ||
      trimmed.startsWith("#ifdef") ||
      trimmed.startsWith("#ifndef") ||
      trimmed.startsWith("#endif") ||
      trimmed.startsWith("#pragma")
    ) {
      return line;
    }
    const hashIdx = line.indexOf("#");
    if (hashIdx !== -1) {
      return line.substring(0, hashIdx);
    }
    return line;
  });

  return processedLines.join("\n");
}

/**
 * Evaluates the multi-signal scoring logic and resolves the winning language.
 */
export function detectLanguage(code: string): DetectionResult {
  const cleanCode = code.trim();
  if (!cleanCode) {
    return {
      language: "JavaScript",
      confidence: 0,
      reasons: ["Empty code buffer default fallback"],
    };
  }

  const preprocessed = preprocessCode(code);
  const reasons: string[] = [];

  let cScore = 0;
  let cppScore = 0;
  let javaScore = 0;
  let pythonScore = 0;
  let jsScore = 0;

  // 1. Scan language-specific rules
  C_RULES.forEach((rule) => {
    if (rule.pattern.test(preprocessed)) {
      cScore += rule.weight;
      reasons.push(`C: Matched pattern: ${rule.description} (+${rule.weight})`);
    }
  });

  CPP_RULES.forEach((rule) => {
    if (rule.pattern.test(preprocessed)) {
      cppScore += rule.weight;
      reasons.push(`C++: Matched pattern: ${rule.description} (+${rule.weight})`);
    }
  });

  JAVA_RULES.forEach((rule) => {
    if (rule.pattern.test(preprocessed)) {
      javaScore += rule.weight;
      reasons.push(`Java: Matched pattern: ${rule.description} (+${rule.weight})`);
    }
  });

  PYTHON_RULES.forEach((rule) => {
    // For Python main conditional, check preprocessed code
    if (rule.pattern.test(preprocessed)) {
      pythonScore += rule.weight;
      reasons.push(`Python: Matched pattern: ${rule.description} (+${rule.weight})`);
    }
  });

  JS_RULES.forEach((rule) => {
    if (rule.pattern.test(preprocessed)) {
      jsScore += rule.weight;
      reasons.push(`JavaScript: Matched pattern: ${rule.description} (+${rule.weight})`);
    }
  });

  // 2. Adjustments based on structural markers (semicolons/braces)
  const lines = preprocessed.split("\n");
  let semicolonLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      if (trimmed.endsWith(";")) {
        semicolonLines++;
      }
    }
  }

  const hasSemicolons = semicolonLines > 0;
  const hasBraces = preprocessed.includes("{") || preprocessed.includes("}");

  // Semicolon check (penalize python if semicolons exist)
  if (hasSemicolons && pythonScore > 0) {
    pythonScore = Math.floor(pythonScore / 2);
    reasons.push(`Python score penalized due to statement-ending semicolons (;)`);
  }

  // Braces check (penalize C/C++/Java/JS if braces are absent)
  if (!hasBraces) {
    if (cScore > 0) {
      cScore = Math.floor(cScore / 5);
      reasons.push(`C score heavily penalized due to missing curly braces ({})`);
    }
    if (cppScore > 0) {
      cppScore = Math.floor(cppScore / 5);
      reasons.push(`C++ score heavily penalized due to missing curly braces ({})`);
    }
    if (javaScore > 0) {
      javaScore = Math.floor(javaScore / 5);
      reasons.push(`Java score heavily penalized due to missing curly braces ({})`);
    }
    if (jsScore > 0) {
      jsScore = Math.floor(jsScore / 5);
      reasons.push(`JavaScript score heavily penalized due to missing curly braces ({})`);
    }
  }

  // 3. Resolve results
  const scores = [
    { language: "C", score: cScore },
    { language: "C++", score: cppScore },
    { language: "Java", score: javaScore },
    { language: "Python", score: pythonScore },
    { language: "JavaScript", score: jsScore },
  ];

  scores.sort((a, b) => b.score - a.score);

  const winning = scores[0];
  const totalScore = cScore + cppScore + javaScore + pythonScore + jsScore;

  if (winning.score === 0 || totalScore === 0) {
    return {
      language: "JavaScript",
      confidence: 0,
      reasons: ["No distinct syntax patterns identified. Fallback to JavaScript."],
    };
  }

  // Calculate base confidence
  let confidence = winning.score / totalScore;

  // Scale down confidence for low absolute scores
  if (winning.score < 10) {
    confidence *= 0.5;
  } else if (winning.score < 20) {
    confidence *= 0.8;
  }

  // If there's a tie or the second place is extremely close, scale down confidence
  const runnerUp = scores[1];
  if (runnerUp && runnerUp.score > 0) {
    const margin = winning.score - runnerUp.score;
    if (margin === 0) {
      confidence = 0.5; // perfect tie
      reasons.push(`Ambiguity detected: Tie between ${winning.language} and ${runnerUp.language}`);
    } else if (margin < 5) {
      confidence *= 0.7; // very close margin
      reasons.push(
        `Ambiguous proximity: runner-up ${runnerUp.language} is close to winner ${winning.language}`
      );
    }
  }

  // Round confidence to two decimal places
  confidence = Math.round(confidence * 100) / 100;

  return {
    language: winning.language,
    confidence: confidence,
    reasons: reasons,
  };
}
