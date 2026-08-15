import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import executeRouter from "./routes/execute.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "128kb" }));
app.use("/api", executeRouter);

// Health Check API
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Graceful Shutdown Handler
function shutdown(signal: string): void {
  console.log(`[server] Received ${signal}, initiating graceful shutdown...`);
  server.close(() => {
    console.log("[server] HTTP server closed cleanly.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[server] Forced shutdown after 10s timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
