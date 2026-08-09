import { getLanguageConfig, LanguageConfig } from "./config.js";

export interface FileMapping {
  sourceFilename: string;
  outputFilename: string;
  classname: string | null;
}

export interface CommandGeneration {
  compilationCommand: string[] | null;
  executionCommand: string[];
  sourceFilename: string;
  config: LanguageConfig;
}

/**
 * Extracts public class name from Java source buffer to meet naming restrictions.
 */
export function extractJavaClassName(code: string): string | null {
  const match = /public\s+class\s+([A-Za-z0-9_]+)/.exec(code);
  return match ? match[1] : null;
}

/**
 * Maps code buffer structure to naming files conventions.
 */
export function getFileMapping(language: string, code: string): FileMapping {
  const normLang = language.toLowerCase();

  if (normLang === "java" || normLang.includes("java")) {
    const classname = extractJavaClassName(code);
    if (classname) {
      return {
        sourceFilename: `${classname}.java`,
        outputFilename: `${classname}.class`,
        classname: classname,
      };
    }
    return {
      sourceFilename: "Main.java",
      outputFilename: "Main.class",
      classname: "Main",
    };
  }

  const ext =
    normLang.includes("cpp") || normLang.includes("c++")
      ? "cpp"
      : normLang === "c"
        ? "c"
        : normLang === "python" || normLang === "py"
          ? "py"
          : normLang.includes("javascript") || normLang === "js"
            ? "js"
            : "txt";

  return {
    sourceFilename: `main.${ext}`,
    outputFilename: "main",
    classname: null,
  };
}

/**
 * Returns arguments list array mapping compilation and execution commands templates.
 */
export function generateCommands(language: string, code: string): CommandGeneration {
  const config = getLanguageConfig(language);
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const mapping = getFileMapping(language, code);

  let compilationCommand: string[] | null = null;
  if (config.compilationRequired) {
    compilationCommand = config.compileCommandTemplate.map((arg) => {
      return arg
        .replace("[source]", mapping.sourceFilename)
        .replace("[output]", mapping.outputFilename);
    });
  }

  const executionCommand = config.executionCommandTemplate.map((arg) => {
    let resolved = arg
      .replace("[source]", mapping.sourceFilename)
      .replace("[output]", mapping.outputFilename);

    if (mapping.classname) {
      resolved = resolved.replace("[classname]", mapping.classname);
    }
    return resolved;
  });

  return {
    compilationCommand,
    executionCommand,
    sourceFilename: mapping.sourceFilename,
    config,
  };
}
