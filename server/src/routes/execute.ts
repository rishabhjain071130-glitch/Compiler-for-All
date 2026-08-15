import { Router, Request, Response } from "express";
import { detectLanguage } from "../../../shared/detector.js";
import { getLanguageConfig } from "../compiler/config.js";
import { SandboxUnavailableRunner, MockCodeRunner, CodeRunner } from "../compiler/runner.js";
import { ErrorCode, parseCompilerOutput } from "../compiler/errorParser.js";

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

// ---------------------------------------------------------------------------
// Minimum confidence threshold for language detection.
// Below this value we reject the request with LANGUAGE_NOT_DETECTED.
// ---------------------------------------------------------------------------
const MIN_DETECTION_CONFIDENCE = 0.05;

// ---------------------------------------------------------------------------
// buildErrorResponse — constructs a standardized error JSON payload.
//
// Security: NEVER include stack traces, host paths, env vars, credentials,
// or internal implementation details in any field of this response.
// ---------------------------------------------------------------------------
function buildErrorResponse(
  code: string,
  message: string,
  details?: string,
  language?: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = { code, message };
  if (details !== undefined) payload.details = details;
  if (language !== undefined) payload.language = language;
  return payload;
}

router.post("/execute", async (req: Request, res: Response): Promise<void> => {
  const { code, stdin } = req.body;

  // 1. Validate payload types
  if (typeof code !== "string" || (stdin !== undefined && typeof stdin !== "string")) {
    res
      .status(400)
      .json(
        buildErrorResponse(
          ErrorCode.INVALID_REQUEST,
          "Payload parameter 'code' (string) is required, and 'stdin' (string) is optional."
        )
      );
    return;
  }

  // 2. Validate payload size limits
  const codeBytes = Buffer.byteLength(code, "utf8");
  const stdinBytes = stdin ? Buffer.byteLength(stdin, "utf8") : 0;

  if (codeBytes > MAX_CODE_BYTES) {
    res
      .status(400)
      .json(
        buildErrorResponse(
          ErrorCode.CODE_TOO_LARGE,
          `Code payload exceeds the maximum allowed size of 64 KB (received: ${(codeBytes / 1024).toFixed(2)} KB).`
        )
      );
    return;
  }

  if (stdinBytes > MAX_STDIN_BYTES) {
    res
      .status(400)
      .json(
        buildErrorResponse(
          ErrorCode.STDIN_TOO_LARGE,
          `Standard input payload exceeds the maximum allowed size of 16 KB (received: ${(stdinBytes / 1024).toFixed(2)} KB).`
        )
      );
    return;
  }

  // 3. Reject empty code bodies
  if (!code.trim()) {
    res
      .status(400)
      .json(buildErrorResponse(ErrorCode.INVALID_REQUEST, "Code payload cannot be empty."));
    return;
  }

  // 4. Authoritative language detection (server-side — client cannot override)
  const detection = detectLanguage(code);

  // 5. Reject when language cannot be determined with sufficient confidence
  if (detection.confidence < MIN_DETECTION_CONFIDENCE) {
    res
      .status(400)
      .json(
        buildErrorResponse(
          ErrorCode.LANGUAGE_NOT_DETECTED,
          "Unable to determine the programming language of the submitted code. " +
            "Write more code or use language-specific syntax so the engine can detect it."
        )
      );
    return;
  }

  // 6. Verify language is supported
  const config = getLanguageConfig(detection.language);
  if (!config) {
    res
      .status(400)
      .json(
        buildErrorResponse(
          ErrorCode.UNSUPPORTED_LANGUAGE,
          `The detected language '${detection.language}' is not supported by the compiler engine.`
        )
      );
    return;
  }

  // 7. Delegate to the active runner through the CodeRunner abstraction.
  //    The execution service never directly invokes host processes.
  try {
    const result = await activeRunner.run(code, stdin || "", detection.language);

    // Runner unavailable — sandbox not yet implemented
    if (result.status === "runner_unavailable") {
      res
        .status(503)
        .json(
          buildErrorResponse(
            ErrorCode.RUNNER_UNAVAILABLE,
            "The isolated execution environment is currently unavailable. " +
              "Code execution requires a sandboxed runner (planned for Phase 8: Sandbox Isolation). " +
              "No user code was executed on the host system.",
            undefined,
            config.displayName
          )
        );
      return;
    }

    // Toolchain not found (mock or future sandbox pre-flight check)
    if (result.status === "error" && result.errorCode === "TOOLCHAIN_NOT_FOUND") {
      res
        .status(503)
        .json(
          buildErrorResponse(
            ErrorCode.TOOLCHAIN_NOT_FOUND,
            `${config.displayName} compiler/interpreter is not available in the execution environment.`,
            undefined,
            config.displayName
          )
        );
      return;
    }

    // Parse compiler diagnostics when compilation output is present and not already provided
    let diagnostics = result.diagnostics;
    let friendlyMessage: string | undefined = result.friendlyMessage;

    if (!diagnostics || diagnostics.length === 0) {
      const rawForParsing = result.compilationOutput || result.stderr || "";
      if (rawForParsing) {
        const parsed = parseCompilerOutput(detection.language, rawForParsing);
        diagnostics = parsed.diagnostics;
        friendlyMessage = friendlyMessage ?? (parsed.friendlyMessage ?? undefined);
      }
    }

    if (!friendlyMessage && result.stderr) {
      const { friendlyMessage: fm } = parseCompilerOutput(detection.language, result.stderr);
      friendlyMessage = fm ?? undefined;
    }

    // Return execution result with diagnostics attached
    res.json({
      ...result,
      diagnostics: diagnostics ?? [],
      friendlyMessage: friendlyMessage ?? null,
    });
  } catch (error: unknown) {
    // Catch-all: log internally, never expose raw error to client
    const err = error as Error;
    // Log to server stderr only — not returned to client
    process.stderr.write(`[execute] Internal error: ${err.message}\n`);
    res
      .status(500)
      .json(
        buildErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          "An unexpected internal server error occurred. Please try again."
        )
      );
  }
});

export default router;
