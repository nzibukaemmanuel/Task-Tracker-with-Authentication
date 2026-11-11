const pool = require("../config/db");

const COLUMNS =
  'id, title, description, completed, user_id AS "userId", created_at AS "createdAt"';

// OWNERSHIP RULE, enforced in SQL so no route can forget it:
//   admin -> no extra filter (sees and manages every task)
//   user  -> only rows whose user_id is their own id
// `startAt` is the number of the next free $ placeholder in the query.
const ownerFilter = (user, startAt) =>
  user.role === "admin"
    ? { sql: "", params: [] }
    : { sql: ` AND user_id = $${startAt}`, params: [user.id] };

class Task {
  static async getAll(user) {
    const owner = ownerFilter(user, 1);
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM tasks WHERE TRUE${owner.sql} ORDER BY id`,
      owner.params
    );
    return rows;
  }

  static async getById(id, user) {
    const owner = ownerFilter(user, 2);
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM tasks WHERE id = $1${owner.sql}`,
      [id, ...owner.params]
    );
    return rows[0] || null;
  }

  // Total number of tasks (used by the public /health endpoint)
  static async count() {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM tasks");
    return rows[0].count;
  }

  // The owner is always the logged-in user, never taken from the request body
  static async create({ title, description = "", userId }) {
    const { rows } = await pool.query(
      `INSERT INTO tasks (title, description, user_id)
       VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [title, description, userId]
    );
    return rows[0];
  }

  // Updates only the provided fields (title, description and/or completed)
  static async update(id, { title, description, completed }, user) {
    const owner = ownerFilter(user, 5);
    const { rows } = await pool.query(
      `UPDATE tasks
         SET title = COALESCE($2, title),
             description = COALESCE($3, description),
             completed = COALESCE($4, completed)
       WHERE id = $1${owner.sql}
       RETURNING ${COLUMNS}`,
      [id, title ?? null, description ?? null, completed ?? null, ...owner.params]
    );
    return rows[0] || null;
  }

  static async delete(id, user) {
    const owner = ownerFilter(user, 2);
    const { rows } = await pool.query(
      `DELETE FROM tasks WHERE id = $1${owner.sql} RETURNING ${COLUMNS}`,
      [id, ...owner.params]
    );
    return rows[0] || null;
  }
}

module.exports = Task;
