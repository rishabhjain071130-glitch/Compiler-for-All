import { Router, Request, Response } from "express";
import { detectLanguage } from "../../../shared/detector.js";
import { getLanguageConfig } from "../compiler/config.js";
import { LocalCodeRunner, MockCodeRunner, CodeRunner } from "../compiler/runner.js";

const router = Router();

// Configure the active execution runner (Mock in testing, Local in dev)
const useMock =
  process.env.NODE_ENV === "test" && process.env.ENABLE_LOCAL_HOST_EXECUTION !== "true";
export const activeRunner: CodeRunner = useMock ? new MockCodeRunner() : new LocalCodeRunner();

// Max limit bounds
const MAX_CODE_BYTES = 64 * 1024; // 64KB
const MAX_STDIN_BYTES = 16 * 1024; // 16KB

router.post("/execute", async (req: Request, res: Response): Promise<void> => {
  const { code, stdin } = req.body;

  // 1. Validate payload parameters exist and are strings
  if (typeof code !== "string" || (stdin !== undefined && typeof stdin !== "string")) {
    res.status(400).json({
      error: "Bad Request",
      message: "Payload parameters 'code' (string) is required, and 'stdin' (string) is optional.",
    });
    return;
  }

  // 2. Validate payload size limits
  const codeBytes = Buffer.byteLength(code, "utf8");
  const stdinBytes = stdin ? Buffer.byteLength(stdin, "utf8") : 0;

  if (codeBytes > MAX_CODE_BYTES) {
    res.status(400).json({
      error: "Payload Too Large",
      message: `Code payload exceeds maximum size limit of 64KB (Current: ${(codeBytes / 1024).toFixed(2)}KB).`,
    });
    return;
  }

  if (stdinBytes > MAX_STDIN_BYTES) {
    res.status(400).json({
      error: "Payload Too Large",
      message: `Stdin payload exceeds maximum size limit of 16KB (Current: ${(stdinBytes / 1024).toFixed(2)}KB).`,
    });
    return;
  }

  if (!code.trim()) {
    res.status(400).json({
      error: "Bad Request",
      message: "Code payload cannot be empty.",
    });
    return;
  }

  // 3. Authoritative language detection
  const detection = detectLanguage(code);

  // 4. Verify language configuration
  const config = getLanguageConfig(detection.language);
  if (!config) {
    res.status(400).json({
      error: "Unsupported Language",
      message: `The detected language '${detection.language}' is not supported by the compiler engine.`,
    });
    return;
  }

  // 5. Delegate run command to the active runner (Mock or Local)
  try {
    const result = await activeRunner.run(code, stdin || "", detection.language);

    if (result.status === "error" && result.stderr.includes("Execution environment unavailable")) {
      res.status(400).json({
        code: "TOOLCHAIN_NOT_FOUND",
        language: config.displayName,
        message: `${config.displayName} compiler/interpreter is not available on this system.`,
      });
      return;
    }

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message || "Failed to execute compile or runtime instructions.",
    });
  }
});

export default router;
