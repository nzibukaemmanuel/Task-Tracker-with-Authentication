# Task Tracker with Authentication: Lab Explanation

## Overview

This lab secures the existing Task Tracker API. Before, every route was public: anyone could view or change any task. Now:

- Only registered users can log in and create tasks.
- Users can only manage their own tasks.
- Admins can view and manage all tasks, and list all users.

The work builds in layers, and each layer relies on the one before it: **users in the database → register and log in → token verification → route protection → ownership → roles**.

## Requirements and how each is met

### 1. User management

| Requirement | How the project meets it |
|---|---|
| User model with name, email, password, role | `db/schema.sql` defines the `users` table; `models/User.js` reads and writes it. `email` is `UNIQUE` and `role` is limited to `user` or `admin` by a `CHECK` constraint. |
| Hash passwords with bcrypt before storing | `authController.register` calls `bcrypt.hash(password, 10)`. Only the hash is stored in `password_hash`, and no endpoint ever returns it. |
| `POST /auth/register` | Validates `name`, `email` and `password` (min 8 characters), normalises the email, creates a `user`, returns a token. A duplicate email returns `409`. |
| `POST /auth/login` | Compares the password with `bcrypt.compare` and returns a token. Served at both `/auth/*` and `/api/auth/*`. |

### 2. JWT authentication

| Requirement | How the project meets it |
|---|---|
| Generate a JWT after login | `signToken` in `authController.js` signs `{ sub: <user id> }`. Registration returns one too. |
| Secret key in an environment variable | `config/config.js` reads `JWT_SECRET`. There is **no default**: the server refuses to start without it. |
| Token expiration | `JWT_EXPIRES_IN` (default `1h`) is passed to `jwt.sign`. |
| Middleware that verifies the `Authorization` header | `middleware/authMiddleware.js` (`authenticate`) reads `Authorization: Bearer <token>`, verifies signature and expiry, loads the user and sets `req.user`. |
| Reject unauthorized requests with proper status codes | `401` for a missing token (`Authentication required`), an expired one (`Token expired`), a bad or forged one (`Invalid token`) and a deleted user (`User no longer exists`). |

### 3. Route protection

| Requirement | How the project meets it |
|---|---|
| Protect create, update and delete | `routes/taskRoutes.js` calls `router.use(authenticate)` before any route, so **every** task route needs a token, including reads. |
| Users only access their own tasks | `models/Task.js` adds `AND user_id = <id>` to every read, update and delete. The owner is taken from the token when a task is created. |
| User A cannot delete User B's task | The delete query matches nothing, so the response is `404 Task not found`, the same as for a task that does not exist. |

### 4. Role-based access control

| Requirement | How the project meets it |
|---|---|
| Extend middleware with authorization | `middleware/roleMiddleware.js` exports `authorize(...roles)`, used after `authenticate`. Wrong role returns `403`. |
| Admin: view all users | `GET /api/users` is guarded by `authenticate` then `authorize("admin")`. |
| Admin: manage all tasks | For admins the ownership condition is skipped, so they can list, read, replace, update and delete any task. |
| Admins are not self-service | `register` never reads a role from the request. `npm run create-admin` (`db/createAdmin.js`) is the only way to create or promote one. |

### 5. Error handling and responses

| Requirement | How the project meets it |
|---|---|
| Meaningful errors for invalid credentials, missing tokens, unauthorized access, expired tokens | `401 Invalid email or password`, `401 Authentication required`, `403 You do not have permission`, `401 Token expired`. |
| Consistent JSON and proper status codes | Errors are `{ "status": "error", "message": "..." }` everywhere (controllers, auth middleware, 404 handler, central error handler). Successes are `{ "status": "success", ... }`. Codes used: 200, 201, 400, 401, 403, 404, 409, 500. |

### 6. Environment configuration

| Requirement | How the project meets it |
|---|---|
| Sensitive data in `.env`, loaded with dotenv | `JWT_SECRET`, `JWT_EXPIRES_IN` and the `DB_*` settings come from `.env`. `.env.example` documents them. |
| Never hardcode secrets | No secret appears in the source, and a weak or placeholder `JWT_SECRET` stops the server from starting. The tests supply their own throwaway value, only inside the test run. |
| Do not commit `.env` | `.gitignore` excludes it. |

> The lab's example uses `DB_URI`. This project already configured PostgreSQL with separate `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` variables, and keeps them.

## How a request flows

A request to `DELETE /api/tasks/7`:

1. `express.json()` parses the body, and the router sends the request to `taskRoutes`.
2. **`authenticate`** reads the `Authorization` header and verifies the JWT with `JWT_SECRET`. A bad token ends here with `401`.
3. It loads the user from the database. A deleted user ends here with `401`. Otherwise `req.user` is set.
4. **`deleteTask`** validates the id (a non-integer returns `404` without touching the database).
5. **`Task.delete(id, req.user)`** runs `DELETE ... WHERE id = $1 AND user_id = $2`. The `AND user_id` part is left out for admins.
6. No row deleted means `404`; otherwise `200` with the deleted task.

## Key design decisions

- **The token carries only the user id.** The role and existence of the user are read from the database on every request, so a deleted or demoted user loses access immediately instead of when the token expires.
- **Ownership lives in SQL.** One helper in `models/Task.js` adds the condition to every query, so no route can forget it. Putting the check in the query also avoids a gap between "check" and "act".
- **404 for other people's tasks, not 403.** A 403 would confirm that the task exists. A 404 reveals nothing.
- **Same login error for a wrong password and an unknown email.** Login cannot be used to discover which emails are registered.
- **bcrypt, 10 rounds.** Slow on purpose, salted automatically, so stolen hashes are expensive to crack.
- **The signature is checked before the expiry.** An expired token that is also forged reports `Invalid token`, not `Token expired`, so a forger learns nothing.
- **No default `JWT_SECRET`, and a strong one is enforced.** A default would let anyone who reads the source forge tokens, including admin ones, so startup fails if the secret is missing, shorter than 32 characters or the `.env.example` placeholder.
- **The JWT algorithm is pinned to HS256** when verifying, so a token cannot choose its own algorithm (for example `none`).
- **Secure error handling.** `errorMiddleware` logs every error in full but, outside development, returns only "Internal Server Error" for 5xx responses, so database messages, hostnames or SQL never reach the client. 4xx messages are written for the client and are kept.
- **Admins are created out of band.** Nothing reachable over HTTP can grant the admin role.
- **PUT and PATCH both exist.** PUT replaces the whole task (`title` required, other fields reset to defaults). PATCH changes only the fields sent.

## Testing

`npm test` runs four suites against a separate `<DB_NAME>_test` database (126 tests):

- `auth.test.js`: registration and login validation, duplicates, hashing, token contents.
- `api.test.js`: token verification (missing, wrong scheme, garbage, forged, tampered, expired, deleted user), protection of every task route, CRUD, PUT, ownership, admin access and response formats.
- `admin.test.js`: the `create-admin` command, the `authorize` middleware and `GET /api/users`.
- `config.test.js`: the server refuses to start without a strong `JWT_SECRET` (missing, too short, placeholder).

A Postman collection in `docs/postman/` walks through the same flows by hand.

## Running the project

```bash
npm install
# create an empty database named task_tracker_db, then copy .env.example to .env
# and set JWT_SECRET (node -p "require('crypto').randomBytes(32).toString('hex')")
npm run db:init        # creates the users and tasks tables
npm run create-admin   # optional: ADMIN_EMAIL and ADMIN_PASSWORD
npm run dev            # development with nodemon
npm test               # integration tests
```

## Deployment

`render.yaml` defines a web service and a managed PostgreSQL database, wires the `DB_*` variables, and generates a random `JWT_SECRET`. The start command runs `npm run db:init && npm start`. Create the first admin from the Render shell with `npm run create-admin`.

## Limitations and extensions

Not implemented (the lab lists them as optional): refresh tokens, password reset, email verification, rate limiting, Helmet, logout and session invalidation, activity logging, profile management and Swagger docs.

Other limits:

- A token is valid until it expires, unless the user is deleted.
- Tasks created before authentication have no owner and are visible only to admins.
- No pagination and no migration tooling: the schema is a single idempotent SQL file.
