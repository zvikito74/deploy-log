const crypto = require("node:crypto");
const express = require("express");

const STATUSES = ["success", "failed", "in_progress", "rolled_back"];
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,49}$/;

function validate(body) {
  const errors = [];
  const d = {
    service: String(body.service || "").trim().toLowerCase(),
    version: String(body.version || "").trim(),
    environment: String(body.environment || "").trim().toLowerCase(),
    status: String(body.status || "success").trim().toLowerCase(),
    commit: body.commit ? String(body.commit).trim().slice(0, 40) : null,
    author: body.author ? String(body.author).trim().slice(0, 60) : null,
  };

  if (!NAME_PATTERN.test(d.service)) errors.push("service must be 1-50 characters: a-z, 0-9, dot, dash, underscore");
  if (!NAME_PATTERN.test(d.environment)) errors.push("environment must be 1-50 characters: a-z, 0-9, dot, dash, underscore");
  if (!d.version || d.version.length > 50) errors.push("version is required (50 characters at most)");
  if (!STATUSES.includes(d.status)) errors.push("status must be one of: " + STATUSES.join(", "));

  return { errors, deployment: d };
}

// Compare tokens in constant time so the check does not leak how many characters matched
function tokenMatches(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createApp(store, { token }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));

  // Wrap async handlers so a rejected promise reaches the error handler
  const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

  function requireToken(req, res, next) {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer ") || !tokenMatches(header.slice(7), token)) {
      return res.status(401).json({ error: "missing or invalid API token" });
    }
    next();
  }

  app.get("/api/health", handle(async (req, res) => {
    await store.ping();
    res.json({ status: "ok" });
  }));

  app.post("/api/deployments", requireToken, handle(async (req, res) => {
    const { errors, deployment } = validate(req.body || {});
    if (errors.length) return res.status(400).json({ errors });
    res.status(201).json(await store.add(deployment));
  }));

  app.get("/api/deployments", handle(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    res.json(await store.list({
      service: req.query.service,
      environment: req.query.environment,
      limit,
    }));
  }));

  app.get("/api/summary", handle(async (req, res) => {
    const [latest, stats] = await Promise.all([store.latest(), store.stats(7)]);
    const finished = stats.succeeded + stats.failed;
    res.json({
      latest,
      last7Days: {
        total: stats.total,
        succeeded: stats.succeeded,
        failed: stats.failed,
        successRate: finished ? Math.round((100 * stats.succeeded) / finished) : null,
      },
    });
  }));

  app.use((req, res) => res.status(404).json({ error: "not found" }));

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "invalid JSON" });
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}

module.exports = { createApp, validate };
