require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { connectDb, isDbConnected } = require("./db");
const routes = require("./routes");
const { startScheduler } = require("./scheduler");
const { authRouter } = require("./linkedin");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve the frontend from /public (open http://localhost:3000)
app.use(express.static(path.join(__dirname, "..", "public"), { index: "repurpose-studio.html" }));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "repurpose-studio",
    time: new Date().toISOString(),
    mongodb: isDbConnected() ? "connected" : "not connected",
  });
});

// LinkedIn login (OAuth)
app.use("/auth", authRouter);

// Articles and posts API
app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

async function start() {
  await connectDb();
  if (isDbConnected()) await startScheduler();
  else console.log("Scheduler not started: database not connected.");

  app.listen(PORT, () => {
    console.log(`Repurpose Studio listening on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});