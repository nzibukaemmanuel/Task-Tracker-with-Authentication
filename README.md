# Task Tracker with Authentication

A RESTful Task Tracker API built with **Express.js** and **PostgreSQL**, secured with **JWT authentication** and **role-based access control**.

- Users register and log in with an email and password (hashed with **bcrypt**).
- Logging in returns a **JSON Web Token** that must be sent with every task request.
- Users can only see and manage **their own tasks**.
- **Admins** can see and manage **all tasks** and list all users.

## Topics covered

- Password hashing with bcrypt
- Token-based authentication with JWT (secret from the environment, token expiry)
- Authentication middleware that protects private routes
- Role-based access control (user / admin)
- Ownership rules enforced in SQL
- Consistent JSON errors with correct HTTP status codes
- Integration testing against a separate test database

## Getting started

### Prerequisites

- Node.js 18 or later
- PostgreSQL running locally (default port 5432)

### 1. Install

```bash
npm install
```

### 2. Create the database

Create an empty database named `task_tracker_db` (pgAdmin, or `CREATE DATABASE task_tracker_db;` in `psql`).

### 3. Configure

Copy `.env.example` to `.env` (it is git-ignored) and fill in your values:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_tracker_db
DB_USER=postgres
DB_PASSWORD=your_password_here

JWT_SECRET=a_long_random_string
JWT_EXPIRES_IN=1h
```

Generate a strong secret with:

```bash
node -p "require('crypto').randomBytes(32).toString('hex')"
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Port the server listens on |
| `NODE_ENV` | `development` | In `development`, error responses include the stack trace |
| `DB_HOST` / `DB_PORT` | – | PostgreSQL server address |
| `DB_NAME` | – | Database name (`task_tracker_db`) |
| `DB_USER` / `DB_PASSWORD` | – | Database credentials |
| `JWT_SECRET` | **required** | Signs every token. No default: the server refuses to start without it, or if it is shorter than 32 characters or still the `.env.example` placeholder |
| `JWT_EXPIRES_IN` | `1h` | How long a token stays valid |

### 4. Create the tables and run

```bash
npm run db:init   # creates the users and tasks tables (safe to re-run)
npm run dev       # development, restarts on file changes
# or
npm start         # production, plain node
```

### 5. Create an admin (optional)

Nobody can register as an admin through the API. Create one on the command line:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=a-strong-password npm run create-admin
```

If the email already belongs to a user, that account is promoted to admin and its password is replaced.

## Project structure

```
Task-Tracker-with-Authentication/
├── app.js                       # Express app: middleware, routes, /health, /db-test
├── server.js                    # Entry point: starts listening on PORT
├── config/
│   ├── config.js                # PORT, NODE_ENV, JWT secret and expiry
│   └── db.js                    # PostgreSQL connection pool (reads DB_* variables)
├── db/
│   ├── schema.sql               # users and tasks tables
│   ├── init.js                  # applies schema.sql (npm run db:init)
│   └── createAdmin.js           # creates or promotes an admin (npm run create-admin)
├── models/
│   ├── User.js                  # SQL queries for users
│   └── Task.js                  # SQL queries for tasks (scoped to the owner)
├── controllers/
│   ├── authController.js        # register, login, me
│   ├── taskController.js        # validation, responses, error forwarding
│   └── userController.js        # admin: list users
├── routes/
│   ├── authRoutes.js            # /auth and /api/auth
│   ├── taskRoutes.js            # /api/tasks (all protected)
│   └── userRoutes.js            # /api/users (admin only)
├── middleware/
│   ├── authMiddleware.js        # authenticate: verifies the JWT, sets req.user
│   ├── roleMiddleware.js        # authorize(...roles): role-based access
│   ├── notFoundMiddleware.js    # 404 for unknown routes
│   └── errorMiddleware.js       # central error handler
├── docs/
│   ├── REVIEWER_GUIDE.md        # requirement-by-requirement guide for the reviewer
│   ├── LAB_EXPLANATION.md       # design decisions and how a request flows
│   └── postman/                 # Postman collection to try every flow
├── tests/                       # Jest + Supertest suite and test-database setup
├── jest.config.js
├── render.yaml                  # Render blueprint (web service + PostgreSQL)
└── .env.example
```

## Database schema

```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,            -- bcrypt hash, never the password
  role          VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tasks (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  completed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE   -- the owner
);
```

Deleting a user deletes their tasks. Tasks created before authentication existed have no owner and are visible only to admins.

The objects returned by the API:

```json
{ "id": 1, "name": "Ada", "email": "ada@example.com", "role": "user", "createdAt": "2026-11-10T09:30:00.000Z" }
```

```json
{ "id": 1, "title": "Write the README", "description": "", "completed": false, "userId": 1, "createdAt": "2026-11-10T09:30:00.000Z" }
```

## How authentication works

1. **Register or log in.** `POST /api/auth/register` or `/login` verifies the input and returns a JWT.
2. **Send the token.** Every protected request carries `Authorization: Bearer <token>`.
3. **`authenticate` middleware.** Verifies the token's signature and expiry, loads the user from the database and sets `req.user`. A deleted user's token stops working immediately.
4. **Authorization.** Task queries are filtered by owner (`AND user_id = <your id>`) unless the user is an admin. Admin-only routes also use `authorize("admin")`.

| Role | Can do |
|---|---|
| `user` | Register, log in, create tasks, and read, replace, update and delete **their own** tasks |
| `admin` | Everything a user can, plus read, replace, update and delete **any** task and list all users |

Security choices:

- **bcrypt** (10 rounds, salted) for passwords; the hash is never returned by any endpoint.
- The **role is never read from a request**, so nobody can register as an admin.
- **Same message for a wrong password and an unknown email** ("Invalid email or password"), so login cannot be used to find out which emails exist.
- Another user's task returns **404, not 403**, so task ids cannot be probed.
- The **owner is taken from the token**, never from the request body, and cannot be changed.
- `JWT_SECRET` comes from the environment and has **no default value**; it must be at least 32 characters and not the placeholder. `.env` is git-ignored.
- Tokens are signed and verified with **HS256 only** (the algorithm is pinned), so a token claiming `none` or another algorithm is rejected.
- **500 errors never leak internals**: outside development the client gets a generic "Internal Server Error" while the real error is logged on the server.
- All SQL uses **parameterized queries**.

## API reference

Base URL: `http://localhost:5000`

### Public

| Method | Endpoint | Description | Success |
|---|---|---|---|
| GET | `/` | Welcome message | 200 |
| GET | `/health` | Status, uptime, task count | 200 |
| GET | `/db-test` | Confirms the database connection | 200 |
| POST | `/api/auth/register` (also `/auth/register`) | Create an account: `name`, `email`, `password` (min 8 characters). Returns a token | 201 |
| POST | `/api/auth/login` (also `/auth/login`) | Log in: `email`, `password`. Returns a token | 200 |

### Requires a token

| Method | Endpoint | Description | Access | Success |
|---|---|---|---|---|
| GET | `/api/auth/me` | The current user | any user | 200 |
| GET | `/api/tasks` | List tasks | own tasks (admin: all) | 200 |
| POST | `/api/tasks` | Create a task you own | any user | 201 |
| GET | `/api/tasks/:id` | Get one task | owner or admin | 200 |
| PUT | `/api/tasks/:id` | Replace the whole task (`title` required; other fields reset to defaults) | owner or admin | 200 |
| PATCH | `/api/tasks/:id` | Update only the fields you send | owner or admin | 200 |
| DELETE | `/api/tasks/:id` | Delete a task | owner or admin | 200 |
| GET | `/api/users` | List all users | **admin only** | 200 |

### Task fields

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Generated by the database. Cannot be changed. |
| `title` | string | Required, non-empty, max 255 characters. |
| `description` | string | Optional, defaults to `""`. |
| `completed` | boolean | Starts as `false`. |
| `userId` | integer | The owner. Set from the token; cannot be changed. |
| `createdAt` | string | Timestamp set by the database. Cannot be changed. |

### Examples

```bash
# Register (returns a token)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@example.com","password":"password123"}'

# Log in
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"password123"}'

# Use the token on every task request
TOKEN=<paste the token here>

curl -X POST http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Write the README","description":"Explain how the lab works"}'

curl http://localhost:5000/api/tasks -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:5000/api/tasks/1 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"completed":true}'

curl -X DELETE http://localhost:5000/api/tasks/1 -H "Authorization: Bearer $TOKEN"
```

A [Postman collection](docs/postman/task-tracker-auth.postman_collection.json) covering every flow is included.

**Reviewing this lab?** Start with the [Reviewer Guide](docs/REVIEWER_GUIDE.md): it maps every requirement and rubric item to the code and shows how to verify it.

## Responses and errors

Success responses look like `{ "status": "success", "data": ... }`; lists also include `count`, and register/login include a `token`.

All errors return JSON like `{ "status": "error", "message": "..." }`:

| Status | When | Example message |
|---|---|---|
| 400 | Missing/invalid fields, empty PATCH body, malformed JSON | `Password must be at least 8 characters` |
| 401 | No token, expired token, invalid token, deleted user, wrong login | `Authentication required`, `Token expired`, `Invalid token`, `Invalid email or password` |
| 403 | Logged in but the role is not allowed (e.g. `GET /api/users` as a user) | `You do not have permission` |
| 404 | Task not found, someone else's task, non-numeric id, unknown route | `Task not found` |
| 409 | Email already registered | `Email is already registered` |
| 500 | Unexpected error, such as the database being unreachable | `Internal Server Error` (the real cause is only in the server log; shown to the client only in development) |

Every controller wraps its database calls in `try/catch` and forwards failures with `next(error)`. `errorMiddleware` logs the error and replies with its `statusCode` (or 500); the stack trace is included only when `NODE_ENV=development`.

## Design notes

- **Parameterized queries:** every query uses `$1, $2, ...` placeholders, so user input is never concatenated into SQL.
- **Ownership in SQL:** `models/Task.js` adds the owner condition to every query, so no route can forget it.
- **Connection pool:** `config/db.js` exports one `pg` Pool shared by the whole app.
- **PATCH and PUT:** PATCH is a partial update (`COALESCE` keeps columns you did not send); PUT replaces the whole task.
- **App and server are separate:** `app.js` builds the app and `server.js` only listens, so tests can load the app without opening a port.
- **Out of scope:** pagination, migrations tooling, refresh tokens, password reset.

## Testing

```bash
npm test
```

The Jest + Supertest suite sends real HTTP requests to the app and hits a real PostgreSQL database. To keep your data safe, tests automatically use a **separate database named `<DB_NAME>_test`** (for example `task_tracker_db_test`). `tests/globalSetup.js` creates it and the tables if needed, so the `DB_USER` must be allowed to create databases. Tables are truncated before every test, and the files run one after another (`--runInBand`) because they share that database.

It covers registration and login (validation, duplicates, hashing), token verification (missing, forged, tampered, expired, deleted user), route protection, ownership (users cannot read, change or delete each other's tasks), admin access, the admin-only user list, response formats, and the startup check for `JWT_SECRET`.

## Deploying to Render

`render.yaml` defines a **web service** plus a managed **PostgreSQL** database, wires the `DB_*` variables from the database to the service, and generates a random `JWT_SECRET`.

1. Push the repo to GitHub.
2. In Render choose **New → Blueprint** and select the repository.
3. Approve the blueprint. The start command runs `npm run db:init` (creates the tables) and then `npm start`.
4. Create your first admin from the service's **Shell** tab: `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run create-admin`.
5. Check `https://<your-service>.onrender.com/health` and `/db-test`.

Notes:

- The free web service sleeps when idle, so the first request after a pause is slow. Check Render's current free-plan terms for how long the free database is kept.
- The web service reaches the database over Render's internal network, so no SSL setup is needed. To connect from your own machine to a Render database you would need its external URL and SSL, which `config/db.js` does not enable.

## Scripts

| Command | Use |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart (nodemon) |
| `npm run db:init` | Create the `users` and `tasks` tables (safe to re-run; also upgrades an older database) |
| `npm run create-admin` | Create or promote an admin (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) |
| `npm test` | Run the automated tests |

## Dependencies

- **express**: web framework
- **pg**: PostgreSQL client
- **dotenv**: loads `.env` into `process.env`
- **bcryptjs**: password hashing
- **jsonwebtoken**: signing and verifying JWTs
- **nodemon** (dev), **jest** (dev), **supertest** (dev)

## Limitations and ideas

- No rate limiting on login, no security headers (Helmet), no refresh tokens, no logout or token revocation, no password reset or email verification.
- A token stays valid until it expires (`JWT_EXPIRES_IN`), unless the user is deleted.
