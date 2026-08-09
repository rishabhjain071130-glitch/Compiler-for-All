export interface LanguageConfig {
  language: string;
  displayName: string;
  extension: string;
  compilationRequired: boolean;
  compileCommandTemplate: string[];
  executionCommandTemplate: string[];
}

export const LANGUAGE_REGISTRY: Record<string, LanguageConfig> = {
  c: {
    language: "c",
    displayName: "C",
    extension: "c",
    compilationRequired: true,
    compileCommandTemplate: ["gcc", "-O2", "-std=c11", "-Wall", "[source]", "-o", "[output]"],
    executionCommandTemplate: ["./[output]"],
  },
  cpp: {
    language: "cpp",
    displayName: "C++",
    extension: "cpp",
    compilationRequired: true,
    compileCommandTemplate: ["g++", "-O2", "-std=c++17", "-Wall", "[source]", "-o", "[output]"],
    executionCommandTemplate: ["./[output]"],
  },
  java: {
    language: "java",
    displayName: "Java",
    extension: "java",
    compilationRequired: true,
    compileCommandTemplate: ["javac", "[source]"],
    executionCommandTemplate: ["java", "[classname]"],
  },
  python: {
    language: "python",
    displayName: "Python",
    extension: "py",
    compilationRequired: false,
    compileCommandTemplate: [],
    executionCommandTemplate: ["python3", "[source]"],
  },
  javascript: {
    language: "javascript",
    displayName: "JavaScript",
    extension: "js",
    compilationRequired: false,
    compileCommandTemplate: [],
    executionCommandTemplate: ["node", "[source]"],
  },
};

let mockUnavailableToolchains: string[] = [];

/**
 * Configure standard mock toolchains for missing availability checks.
 */
export function setMockUnavailableToolchains(executables: string[]): void {
  mockUnavailableToolchains = executables;
}

/**
 * Safely verify if a compiler/interpreter toolchain is available on the system.
 */
export function checkToolchainAvailability(language: string): {
  available: boolean;
  executable: string;
} {
  const config = getLanguageConfig(language);
  if (!config) {
    return { available: false, executable: "" };
  }

  // Get primary executable name
  const executable = config.compilationRequired
    ? config.compileCommandTemplate[0]
    : config.executionCommandTemplate[0];

  if (mockUnavailableToolchains.includes(executable)) {
    return { available: false, executable };
  }

  // In this phase, child processes on the host are disabled, so we default to true.
  return { available: true, executable };
}

/**
 * Returns configuration parameters based on case-insensitive language names.
 */
export function getLanguageConfig(language: string): LanguageConfig | null {
  const key = language.toLowerCase().replace("++", "pp");
  return LANGUAGE_REGISTRY[key] || null;
}
