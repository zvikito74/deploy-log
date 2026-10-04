// Two storage backends with the same methods:
//   PgStore     - PostgreSQL, used when the app runs for real
//   MemoryStore - a plain array, used by the tests

const SCHEMA = `
CREATE TABLE IF NOT EXISTS deployments (
  id          SERIAL PRIMARY KEY,
  service     TEXT NOT NULL,
  version     TEXT NOT NULL,
  environment TEXT NOT NULL,
  status      TEXT NOT NULL,
  commit_sha  TEXT,
  author      TEXT,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deployments_latest
  ON deployments (service, environment, id DESC);
`;

function toApi(row) {
  return {
    id: row.id,
    service: row.service,
    version: row.version,
    environment: row.environment,
    status: row.status,
    commit: row.commit_sha,
    author: row.author,
    deployedAt: new Date(row.deployed_at).toISOString(),
  };
}

class PgStore {
  constructor(pool) {
    this.pool = pool;
  }

  async init() {
    await this.pool.query(SCHEMA);
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async add(d) {
    const result = await this.pool.query(
      `INSERT INTO deployments (service, version, environment, status, commit_sha, author)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [d.service, d.version, d.environment, d.status, d.commit, d.author]
    );
    return toApi(result.rows[0]);
  }

  async list({ service, environment, limit }) {
    const result = await this.pool.query(
      `SELECT * FROM deployments
       WHERE ($1::text IS NULL OR service = $1)
         AND ($2::text IS NULL OR environment = $2)
       ORDER BY id DESC LIMIT $3`,
      [service || null, environment || null, limit]
    );
    return result.rows.map(toApi);
  }

  // Newest deployment for every service/environment pair
  async latest() {
    const result = await this.pool.query(
      `SELECT DISTINCT ON (service, environment) *
       FROM deployments ORDER BY service, environment, id DESC`
    );
    return result.rows.map(toApi);
  }

  async stats(days) {
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'success')::int AS succeeded,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM deployments WHERE deployed_at >= now() - make_interval(days => $1)`,
      [days]
    );
    return result.rows[0];
  }
}

class MemoryStore {
  constructor() {
    this.rows = [];
  }

  async init() {}

  async ping() {}

  async add(d) {
    const row = {
      id: this.rows.length + 1,
      service: d.service,
      version: d.version,
      environment: d.environment,
      status: d.status,
      commit_sha: d.commit,
      author: d.author,
      deployed_at: new Date(),
    };
    this.rows.push(row);
    return toApi(row);
  }

  async list({ service, environment, limit }) {
    return this.rows
      .filter((r) => (!service || r.service === service) && (!environment || r.environment === environment))
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map(toApi);
  }

  async latest() {
    const newest = new Map();
    for (const row of this.rows) newest.set(row.service + "/" + row.environment, row);
    return [...newest.values()]
      .sort((a, b) => a.service.localeCompare(b.service) || a.environment.localeCompare(b.environment))
      .map(toApi);
  }

  async stats(days) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = this.rows.filter((r) => r.deployed_at.getTime() >= since);
    return {
      total: recent.length,
      succeeded: recent.filter((r) => r.status === "success").length,
      failed: recent.filter((r) => r.status === "failed").length,
    };
  }
}

module.exports = { PgStore, MemoryStore };
