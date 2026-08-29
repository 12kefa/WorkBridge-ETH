const { Pool } = require('pg');
require('dotenv').config();

// DATABASE_URL (the convention on Render, Railway, Heroku-style platforms)
// takes priority when set; otherwise fall back to the discrete DB_* vars
// used in local dev (see .env.example).
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'workbridge_eth',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

/**
 * Convenience helper. Always use $1, $2 placeholders. Never concatenate user input.
 * @param {string} text  parameterized SQL
 * @param {any[]} params values for $1..$N
 */
const query = (text, params) => pool.query(text, params);

/**
 * Run a function inside a single transaction.
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const connectDB = async () => {
  try {
    const res = await pool.query('SELECT NOW() as now, current_database() as db');
    console.log(`✅ PostgreSQL connected (db=${res.rows[0].db})`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
};

const closeDB = async () => {
  await pool.end();
};

module.exports = { pool, query, withTransaction, connectDB, closeDB };
