import { Router, Request, Response } from "express";
import { detectLanguage } from "../../../shared/detector.js";
import { getLanguageConfig } from "../compiler/config.js";
import { SandboxUnavailableRunner, MockCodeRunner, CodeRunner } from "../compiler/runner.js";

const router = Router();

// ---------------------------------------------------------------------------
// Active runner selection.
//
// Production (NODE_ENV !== "test"):
//   SandboxUnavailableRunner — returns a structured runner_unavailable response.
//   No user code is executed on the host machine.
//   A real sandboxed runner will replace this in Phase 8.
//
// Test (NODE_ENV === "test"):
//   MockCodeRunner — simulates all result types without any host execution.
// ---------------------------------------------------------------------------
const useMock =
  process.env.NODE_ENV === "test" && process.env.ENABLE_LOCAL_HOST_EXECUTION !== "true";

export const activeRunner: CodeRunner = useMock
  ? new MockCodeRunner()
  : new SandboxUnavailableRunner();

// Max payload bounds
const MAX_CODE_BYTES = 64 * 1024; // 64 KB
const MAX_STDIN_BYTES = 16 * 1024; // 16 KB

router.post("/execute", async (req: Request, res: Response): Promise<void> => {
  const { code, stdin } = req.body;

  // 1. Validate payload types
  if (typeof code !== "string" || (stdin !== undefined && typeof stdin !== "string")) {
    res.status(400).json({
      error: "Bad Request",
      message: "Payload parameter 'code' (string) is required, and 'stdin' (string) is optional.",
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

  // 3. Reject empty code bodies
  if (!code.trim()) {
    res.status(400).json({
      error: "Bad Request",
      message: "Code payload cannot be empty.",
    });
    return;
  }

  // 4. Authoritative language detection (server-side — client cannot override)
  const detection = detectLanguage(code);

  // 5. Verify language is supported
  const config = getLanguageConfig(detection.language);
  if (!config) {
    res.status(400).json({
      error: "Unsupported Language",
      message: `The detected language '${detection.language}' is not supported by the compiler engine.`,
    });
    return;
  }

  // 6. Delegate to the active runner through the CodeRunner abstraction.
  //    The execution service never directly invokes host processes.
  try {
    const result = await activeRunner.run(code, stdin || "", detection.language);

    // Runner unavailable — sandbox not yet implemented
    if (result.status === "runner_unavailable") {
      res.status(503).json({
        error: "Service Unavailable",
        code: "RUNNER_UNAVAILABLE",
        language: config.displayName,
        message: result.message,
      });
      return;
    }

    // Toolchain not found (mock or future sandbox pre-flight check)
    if (result.status === "error" && result.errorCode === "TOOLCHAIN_NOT_FOUND") {
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
