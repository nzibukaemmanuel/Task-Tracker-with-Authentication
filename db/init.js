require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await pool.query(sql);
    console.log("tasks table is ready.");
  } catch (error) {
    console.error("Failed to initialise database:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
