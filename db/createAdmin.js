// Creates (or promotes) an admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin
require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("../config/db");

(async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = "Admin" } = process.env;
  try {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
      throw new Error(
        "Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 characters) first"
      );
    }
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = $3`,
      [ADMIN_NAME, ADMIN_EMAIL.toLowerCase(), hash]
    );
    console.log(`Admin ready: ${ADMIN_EMAIL.toLowerCase()}`);
  } catch (error) {
    console.error("Failed to create admin:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
