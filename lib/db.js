import { Pool } from "pg";

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  return pool;
}

export async function getRenderData() {
  const query = process.env.RENDER_SQL_QUERY;

  if (!query) {
    throw new Error("Missing RENDER_SQL_QUERY environment variable.");
  }

  const client = await getPool().connect();

  try {
    const result = await client.query(query);
    return result.rows;
  } finally {
    client.release();
  }
}
