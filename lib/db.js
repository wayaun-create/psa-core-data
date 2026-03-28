import { Pool } from "pg";

let pool;
const DEFAULT_ROW_LIMIT = 50;
const MAX_ROW_LIMIT = 200;

function getRowLimit() {
  const parsed = Number.parseInt(process.env.DATA_ROW_LIMIT ?? "", 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_ROW_LIMIT;
  }

  return Math.min(parsed, MAX_ROW_LIMIT);
}

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
  const limit = getRowLimit();

  const client = await getPool().connect();

  try {
    const [accounts, clients, taxSales, parcels] = await Promise.all([
      client.query("SELECT * FROM accounts ORDER BY acct_id LIMIT $1", [limit]),
      client.query("SELECT * FROM clients ORDER BY client_id LIMIT $1", [limit]),
      client.query("SELECT * FROM tax_sales ORDER BY tax_sale_id LIMIT $1", [limit]),
      client.query("SELECT * FROM parcels ORDER BY parcel_id LIMIT $1", [limit])
    ]);

    return {
      meta: {
        source: "render-postgres",
        rowLimit: limit,
        tables: ["accounts", "clients", "tax_sales", "parcels"]
      },
      tables: {
        accounts: accounts.rows,
        clients: clients.rows,
        tax_sales: taxSales.rows,
        parcels: parcels.rows
      }
    };
  } finally {
    client.release();
  }
}
