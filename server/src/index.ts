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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
