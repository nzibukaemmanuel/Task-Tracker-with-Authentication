const pool = require("../config/db");

// password_hash is deliberately NOT in this list: it never leaves the model
// unless a caller asks for it explicitly (login does).
const PUBLIC_COLUMNS = 'id, name, email, role, created_at AS "createdAt"';

class User {
  static async create({ name, email, passwordHash, role = "user" }) {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC_COLUMNS}`,
      [name, email, passwordHash, role]
    );
    return rows[0];
  }

  // Includes password_hash: only used by login to compare passwords
  static async findByEmailWithPassword(email) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS}, password_hash AS "passwordHash"
         FROM users WHERE email = $1`,
      [email]
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
}

module.exports = User;
