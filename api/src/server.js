const { Pool } = require("pg");
const { createApp } = require("./app");
const { PgStore } = require("./store");

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.API_TOKEN;

if (!TOKEN) {
  console.error("API_TOKEN is not set; refusing to start without one");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The database container may still be starting, so retry for a while
async function connectWithRetry(store, attempts = 15) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await store.init();
      return;
    } catch (err) {
      console.log(`database not ready (attempt ${i}/${attempts}): ${err.message}`);
      await sleep(2000);
    }
  }
  throw new Error("could not connect to the database");
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const store = new PgStore(pool);
  await connectWithRetry(store);

  const server = createApp(store, { token: TOKEN }).listen(PORT, () => {
    console.log(`deploy-log API listening on port ${PORT}`);
  });

  // Finish open requests and close the pool when the container is stopped
  const shutdown = () => {
    console.log("shutting down");
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
