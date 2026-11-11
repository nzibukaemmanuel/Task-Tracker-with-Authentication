# Task Tracker – Database: Lab Explanation

## Overview

This lab takes the in-memory RESTful Task Tracker API and gives it a real database. Tasks are now stored in a PostgreSQL `tasks` table, so they survive server restarts and redeploys. The API surface is almost unchanged; what changes is everything underneath it: the model runs SQL, every call is asynchronous, and database settings come from environment variables.

## Requirements and how each is met

| Requirement | How the project meets it |
|---|---|
| Connect Express to PostgreSQL | `config/db.js` creates one `pg` connection pool from the `DB_*` variables and shares it across the app. |
| Store database settings in environment variables | `.env` (git-ignored) holds `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; `.env.example` documents them; dotenv loads them. |
| Design a `tasks` table | `db/schema.sql` defines `id`, `title`, `description`, `completed` and `created_at`. `npm run db:init` applies it and is safe to re-run. |
| Full CRUD against the database | `models/Task.js` implements `getAll`, `getById`, `create`, `update`, `delete` (plus `count`) with SQL. |
| Use async/await | Every model method and controller is `async`. |
| Handle database errors centrally | Each controller wraps calls in `try/catch` and forwards failures with `next(error)` to `errorMiddleware`, which returns a 500. |
| Verify the connection | `GET /db-test` runs `SELECT NOW()`, and `GET /health` reports the task count from the database. |
| Test the API | Jest and Supertest integration tests run against a real, separate test database. |

## Tasks the lab walks through

1. **Set up PostgreSQL.** Install it locally and create an empty `task_tracker_db` database.
2. **Add the driver and configuration.** Install `pg`, add the `DB_*` variables, and create the connection pool.
3. **Create the schema.** Write `schema.sql` and a small `db/init.js` script that runs it.
4. **Rewrite the model.** Replace the array operations with parameterised SQL queries.
5. **Make the controllers async.** Add `await`, `try/catch` and `next(error)`.
6. **Add diagnostics.** Add `/db-test` and make `/health` count rows in the table.
7. **Test against a database.** Run the suite on an isolated test database.
8. **Deploy.** Provision a managed PostgreSQL instance alongside the web service on Render.

## Database schema

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  completed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The database now generates `id` (an integer, not a UUID) and the timestamp. The model renames `created_at` to `createdAt` in its queries so the JSON stays the same as the in-memory version.

## API

| Method | Endpoint | Purpose | Success |
|---|---|---|---|
| GET | `/` | Welcome message | 200 |
| GET | `/health` | Status, uptime, task count from the database | 200 |
| GET | `/db-test` | Confirms the database connection | 200 |
| GET | `/api/tasks` | List all tasks | 200 |
| GET | `/api/tasks/:id` | Get one task | 200 |
| POST | `/api/tasks` | Create a task | 201 |
| PATCH | `/api/tasks/:id` | Partially update a task | 200 |
| DELETE | `/api/tasks/:id` | Delete a task | 200 |

Errors always return JSON with `status: "error"` and a `message`:

- **400:** missing or invalid title, empty PATCH body, wrong field type, malformed JSON.
- **404:** task not found (including a non-numeric id) or unknown route.
- **500:** unexpected errors, such as the database being unreachable.

## How it works

1. `express.json()` parses the request body and the router picks a controller.
2. The controller validates input. Invalid input gets a 400 immediately; ids that are not valid integers get a 404 without touching the database.
3. The controller `await`s a model method, which runs a parameterised query on the shared pool.
4. The controller sends the JSON response. Any thrown error goes through `next(error)` to the error middleware, which logs it and replies with its `statusCode` or 500, adding the stack trace only when `NODE_ENV=development`.

## Key design decisions

- **Parameterised queries.** Every query uses `$1, $2, ...` placeholders, so user input is never concatenated into SQL. This prevents SQL injection.
- **Connection pool.** One shared `pg` Pool reuses connections instead of opening a new one per request.
- **PATCH with COALESCE.** The update query uses `COALESCE($n, column)`, so fields that were not sent keep their current values. `id` and `created_at` are never writable.
- **Id validation.** Ids are checked against the integer range before querying, so a bad id returns a clean 404 rather than a database error.
- **App and server are separate.** `app.js` builds the app and `server.js` only listens, so tests can load the app without opening a port.

## Testing

`npm test` sends real HTTP requests with Supertest against a real PostgreSQL database. To protect real data:

- `tests/testEnv.js` points the app at a separate database named `<DB_NAME>_test`.
- `tests/globalSetup.js` creates that database and the table if they do not exist, so `DB_USER` must be allowed to create databases.
- The table is truncated before every test, so tests do not depend on each other.

The suite covers the welcome route, `/health`, `/db-test`, create, read, update and delete, validation errors, invalid ids, rows actually persisting in the database, unknown routes, and 500 responses when the database fails.

## Running the project

```bash
npm install
# create an empty database named task_tracker_db, then copy .env.example to .env
npm run db:init   # creates the tasks table
npm run dev       # development with nodemon
npm start         # production
npm test          # integration tests
```

## Deployment

`render.yaml` defines a web service and a managed PostgreSQL database, and wires the `DB_*` variables from the database into the service. The start command runs `npm run db:init && npm start`, so the table is created on each deploy. Data now survives restarts. The free web service still sleeps when idle, and the free database's retention follows Render's current terms.

## Limitations

- No authentication or pagination.
- No migration tooling: the schema is a single idempotent SQL file.
- `config/db.js` does not enable SSL, so connecting from your own machine to a Render database would need extra configuration.
