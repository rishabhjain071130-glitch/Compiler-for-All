import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import executeRouter from "./routes/execute.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
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
