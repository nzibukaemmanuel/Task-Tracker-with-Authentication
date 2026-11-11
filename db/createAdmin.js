// Creates an admin, or promotes an existing user to admin:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=a-strong-password npm run create-admin
// Optional: ADMIN_NAME (default "Admin").
//
// This is the ONLY way to get an admin: the register endpoint always creates
// regular users, so nobody can promote themselves through the API.
require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("../config/db");

const createAdmin = async ({ name = "Admin", email, password }) => {
  if (typeof email !== "string" || !email.includes("@")) {
    throw new Error("ADMIN_EMAIL must be a valid email");
  }
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const normalisedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  // If the email already exists, promote that account and reset its password
  // to the one given; otherwise create it.
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email)
       DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash
     RETURNING id, name, email, role`,
    [name, normalisedEmail, passwordHash]
  );
  return rows[0];
};

module.exports = createAdmin;

// Run as a command (not when imported by tests)
if (require.main === module) {
  (async () => {
    try {
      const admin = await createAdmin({
        name: process.env.ADMIN_NAME,
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      });
      console.log(`Admin ready: ${admin.email}`);
    } catch (error) {
      console.error("Failed to create admin:", error.message);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
