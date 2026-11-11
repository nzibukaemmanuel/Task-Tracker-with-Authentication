// Runs once before all tests: creates the test database (if needed) and the
// tasks table.
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

module.exports = async () => {
  require("./testEnv");

  const connection = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
  const testDb = process.env.DB_NAME;

  const admin = new Pool({ ...connection, database: "postgres" });
  try {
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [testDb]
    );
    if (!rowCount) await admin.query(`CREATE DATABASE "${testDb}"`);
  } finally {
    await admin.end();
  }

  const db = new Pool({ ...connection, database: testDb });
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "../db/schema.sql"),
      "utf8"
    );
    await db.query(sql);
  } finally {
    await db.end();
  }
};
