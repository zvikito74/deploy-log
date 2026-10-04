const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createApp, validate } = require("../src/app");
const { MemoryStore } = require("../src/store");

const TOKEN = "test-token";
let server;
let base;

beforeEach(async () => {
  server = createApp(new MemoryStore(), { token: TOKEN }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => new Promise((resolve) => server.close(resolve)));

function post(body, token = TOKEN) {
  return fetch(base + "/api/deployments", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const get = async (path) => (await fetch(base + path)).json();

test("health", async () => {
  assert.deepEqual(await get("/api/health"), { status: "ok" });
});

test("recording a deployment needs the token", async () => {
  const body = { service: "api", version: "1.0.0", environment: "prod" };
  assert.equal((await post(body, null)).status, 401);
  assert.equal((await post(body, "wrong")).status, 401);
  assert.equal((await post(body)).status, 201);
});

test("records and lists deployments, newest first", async () => {
  await post({ service: "api", version: "1.0.0", environment: "staging" });
  await post({ service: "api", version: "1.1.0", environment: "staging", commit: "abc1234", author: "zviad" });

  const list = await get("/api/deployments");
  assert.equal(list.length, 2);
  assert.equal(list[0].version, "1.1.0");
  assert.equal(list[0].commit, "abc1234");
  assert.equal(list[0].status, "success");
});

test("filters by service and environment", async () => {
  await post({ service: "api", version: "1", environment: "prod" });
  await post({ service: "web", version: "2", environment: "prod" });
  await post({ service: "web", version: "3", environment: "staging" });

  assert.equal((await get("/api/deployments?service=web")).length, 2);
  assert.equal((await get("/api/deployments?service=web&environment=staging")).length, 1);
  assert.equal((await get("/api/deployments?limit=1")).length, 1);
});

test("rejects invalid input", async () => {
  assert.equal((await post({ version: "1", environment: "prod" })).status, 400);
  assert.equal((await post({ service: "api", environment: "prod" })).status, 400);
  assert.equal((await post({ service: "api", version: "1", environment: "prod", status: "weird" })).status, 400);
  assert.equal((await post({ service: "Bad Name!", version: "1", environment: "prod" })).status, 400);
  assert.equal((await post("{not json")).status, 400);
});

test("summary shows the latest version per service and environment", async () => {
  await post({ service: "api", version: "1.0.0", environment: "prod" });
  await post({ service: "api", version: "1.1.0", environment: "prod", status: "failed" });
  await post({ service: "web", version: "5", environment: "prod" });

  const summary = await get("/api/summary");
  assert.equal(summary.latest.length, 2);
  const api = summary.latest.find((d) => d.service === "api");
  assert.equal(api.version, "1.1.0");
  assert.equal(api.status, "failed");
  assert.deepEqual(summary.last7Days, { total: 3, succeeded: 2, failed: 1, successRate: 67 });
});

test("unknown routes return 404", async () => {
  assert.equal((await fetch(base + "/api/nope")).status, 404);
});

test("validate normalises names", () => {
  const { errors, deployment } = validate({ service: " API ", version: "1", environment: "PROD" });
  assert.deepEqual(errors, []);
  assert.equal(deployment.service, "api");
  assert.equal(deployment.environment, "prod");
});
