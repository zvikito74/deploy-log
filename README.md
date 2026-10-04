# deploy-log

A deployment tracker. CI/CD pipelines report each deployment to a small API, and a
dashboard shows which version of every service is running in each environment and what
was deployed recently.

## Stack

| Part | Technology |
| --- | --- |
| API | Node.js, Express |
| Database | PostgreSQL 16 |
| Frontend | HTML, CSS, JavaScript |
| Web server | Nginx (serves the frontend, proxies `/api` to the API) |
| CI | GitHub Actions |

## Run it

```bash
cp .env.example .env        # set a database password and an API token
docker compose up -d --build
```

Open <http://localhost:8091>. To fill it with example data:

```bash
DEPLOY_LOG_URL=http://localhost:8091 DEPLOY_LOG_TOKEN=<your token> bash scripts/seed.sh
```

## Recording a deployment from a pipeline

```bash
export DEPLOY_LOG_URL=http://localhost:8091
export DEPLOY_LOG_TOKEN=<your token>
bash scripts/record-deploy.sh payments-api 2.3.1 prod
```

The script adds the current Git commit and author. In GitHub Actions it would be the
last step of a deploy job, with the token stored as a repository secret.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | – | Checks the API and its database connection |
| POST | `/api/deployments` | Bearer token | Record a deployment |
| GET | `/api/deployments` | – | Recent deployments; filter with `service`, `environment`, `limit` |
| GET | `/api/summary` | – | Latest version per service and environment, plus 7-day totals |

A deployment has `service`, `version`, `environment`, and optionally `status`
(`success`, `failed`, `in_progress`, `rolled_back`), `commit` and `author`.

## How it works

- **Three containers.** `db`, `api` and `web` run on one Docker network. Only the web
  container publishes a port; the API and the database are not reachable from outside.
- **Start order.** The API waits for the database's health check (`pg_isready`), and
  also retries the connection itself, because "healthy" and "accepting connections for
  this user" are not always the same moment.
- **Writes need a token.** Reading is open, but recording a deployment needs
  `Authorization: Bearer <token>`. The token is compared in constant time. The API
  refuses to start if no token is configured.
- **Latest version per environment.** PostgreSQL's `DISTINCT ON (service, environment)`
  with `ORDER BY id DESC` picks the newest row for every pair in one query.
- **No secrets in Git.** The password and token come from `.env`, which is ignored;
  Compose stops with a clear message if either is missing.
- **Graceful shutdown.** On `SIGTERM` the API finishes open requests and closes the
  database pool before exiting.

## Tests

```bash
cd api
npm install
npm test
```

The tests run the real Express app against an in-memory store, so they need no database.
