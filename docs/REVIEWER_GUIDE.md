# Reviewer Guide: Task Tracker with Authentication

This guide follows the lab brief and its grading rubric. For each requirement it says **what was built**, **where to look**, and **how to check it yourself**. Everything below can be verified in about five minutes.

## 1. The problem and the result

**Before:** every route was public, so anyone could view or change any task.

**After:**

| Lab goal | Result |
|---|---|
| Only registered users can log in and create tasks | Every `/api/tasks` route needs a valid JWT. Without one the API answers `401`. |
| Users can only manage their own tasks | Every task query is filtered by owner. Another user's task answers `404`. |
| Admins can view and manage all tasks | The owner filter is skipped for admins. Admins can also list all users. |

## 2. Check it in five minutes

**Setup** (details in the [README](../README.md#getting-started)): install, create the database, copy `.env.example` to `.env`, set a real `JWT_SECRET` (32+ characters), then:

```bash
npm install
npm run db:init                      # creates the users and tasks tables
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=adminpass123 npm run create-admin
npm run dev                          # http://localhost:5000
```

**Option A: the automated suite** (158 tests across 5 files, against a separate `_test` database):

```bash
npm test
```

**Option B: the Postman collection**, which walks through every flow with assertions. Import `docs/postman/task-tracker-auth.postman_collection.json` and run it, or from the command line (28 requests, 48 assertions, all passing when the API is running):

```bash
npx newman run docs/postman/task-tracker-auth.postman_collection.json
```

**Option C: Swagger UI in the browser** (open `http://localhost:5000/api-docs` with the server running): run **POST /api/auth/login**, copy the `token`, click **Authorize**, paste it, and try any padlocked endpoint. See the README for the full steps.

**Option D: by hand with curl:**

```bash
curl -i localhost:5000/api/tasks                                   # 401 Authentication required
curl -X POST localhost:5000/api/auth/register -H "Content-Type: application/json" \
     -d '{"name":"Ada","email":"ada@example.com","password":"password123"}'   # 201 + token
TOKEN=<paste token>
curl -X POST localhost:5000/api/tasks -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"title":"My task"}'              # 201
curl localhost:5000/api/tasks -H "Authorization: Bearer $TOKEN"                # only Ada's tasks
curl localhost:5000/api/users -H "Authorization: Bearer $TOKEN"                # 403 (admin only)
```

## 3. Requirement by requirement

### Requirement 1: User management (rubric: Registration and Login, 20%)

| Brief says | Built | Where |
|---|---|---|
| User model: name, email, password, role | `users` table. `email` is `UNIQUE`; `role` is restricted to `user` or `admin` by a `CHECK` constraint. | `db/schema.sql`, `models/User.js` |
| Hash passwords with bcrypt | `bcrypt.hash(password, 10)` before saving. Only the hash is stored (`password_hash`) and no response ever contains it. | `controllers/authController.js` |
| `POST /auth/register` | Validates name, email and password (min 8 characters), lowercases the email, creates the user and returns a token. Duplicate email returns `409`. | `controllers/authController.js`, `routes/authRoutes.js` |
| `POST /auth/login` | Compares with `bcrypt.compare`. Wrong password and unknown email give the **same** `401` message, so login cannot be used to discover which emails exist. | same |

The routes are served at both `/auth/*` (as the brief names them) and `/api/auth/*` (next to the other API routes).

**Check:** register twice with the same email (`409`); log in with a wrong password and with an unknown email (identical `401`); look at the `users` table and see `$2b$10$...` hashes, not passwords.

### Requirement 2: JWT authentication (rubric: 20%)

| Brief says | Built | Where |
|---|---|---|
| Generate a JWT after login | `{ sub: <user id> }` signed with HS256. Registration returns one too. | `controllers/authController.js` |
| Secret in an environment variable | `JWT_SECRET` from `.env`. **No default value.** The server will not start without it, or if it is shorter than 32 characters, or if it is still the `.env.example` placeholder. | `config/config.js` |
| Token expiration | `JWT_EXPIRES_IN` (default `1h`). | `config/config.js` |
| Middleware verifies the `Authorization` header | `authenticate` reads `Bearer <token>`, verifies signature and expiry, reloads the user from the database and sets `req.user`. | `middleware/authMiddleware.js` |
| Reject unauthorized requests with proper codes | `401` in four distinct cases, listed in section 4. | same |

Two details worth noticing:

- **The token holds only the user id.** The role and the user's existence are read from the database on every request, so a deleted or demoted user loses access immediately, not when the token expires.
- **The algorithm is pinned to HS256.** A token that claims `alg: none` or another algorithm is rejected.

**Check:** call a task route with no token, a garbage token, a token edited by hand, and an expired one. Each is refused with the matching message (the tests do exactly this).

### Requirement 3: Route protection (rubric: 20%)

| Brief says | Built | Where |
|---|---|---|
| Protect create, update and delete | `router.use(authenticate)` is the first line of the task router, so **every** task route is protected, reads included, and a route added later is protected automatically. | `routes/taskRoutes.js` |
| Users access only their own tasks | One helper adds `AND user_id = <id>` to every read, update and delete. The owner is set from the token on creation and cannot be changed. | `models/Task.js` |
| User A cannot delete User B's task | The delete matches no row and returns `404`. | same |

Design choices:

- The ownership rule lives **inside the SQL**, so no controller can forget it.
- Someone else's task returns **`404`, not `403`**. A `403` would confirm that the task exists.
- A request body containing `userId` is ignored on create, `PUT` and `PATCH`.

**Check:** Postman folder 3 registers two users, has B try to read, update and delete A's task (all `404`), and then confirms A's task is untouched.

### Requirement 4: Role-based access control (rubric: 15%)

| Brief says | Built | Where |
|---|---|---|
| Extend middleware with authorization checks | `authorize(...roles)` returns `403` when the role is not allowed. | `middleware/roleMiddleware.js` |
| Admin: view all users | `GET /api/users`, guarded by `authenticate` then `authorize("admin")`. Responses never include password hashes. | `routes/userRoutes.js`, `controllers/userController.js` |
| Admin: manage all tasks | For admins the owner filter is skipped, so they can list, read, replace, update and delete any task. | `models/Task.js` |
| user: own tasks only | See requirement 3. | |

Admins cannot be created through the API: `register` never reads a role from the request body (a test sends `"role": "admin"` and still gets a `user`). The only way is the command line, `npm run create-admin` (`db/createAdmin.js`), which needs access to the server and its database.

**Check:** a regular user calling `GET /api/users` gets `403`; an admin gets the list. A user promoted with `create-admin` gains access on their existing token, because the role is read from the database.

### Requirement 5: Error handling and responses (rubric: Error Handling and Security Practices, 15%, shared with requirement 6)

Every response uses one shape, as the brief's example shows:

```json
{ "status": "error", "message": "Unauthorized access" }
```

Successes use `{ "status": "success", ... }`.

| Case from the brief | Status | Message |
|---|---|---|
| Invalid credentials | `401` | `Invalid email or password` |
| Missing token | `401` | `Authentication required` |
| Expired token | `401` | `Token expired` |
| Invalid or forged token | `401` | `Invalid token` |
| Unauthorized access (wrong role) | `403` | `You do not have permission` |
| Duplicate email | `409` | `Email is already registered` |
| Bad input | `400` | A specific message, for example `Password must be at least 8 characters` |
| Not found, or not yours | `404` | `Task not found` |

**Secure error handling:** the full error is always logged on the server, but outside development a `5xx` returns only `Internal Server Error`. Database messages, hostnames and SQL never reach the client. (Tests mock a database failure that mentions the database user and confirm it does not appear in the response.)

### Requirement 6: Environment configuration

| Brief says | Built |
|---|---|
| Sensitive data in `.env`, loaded with dotenv | `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT` and the database settings come from `.env`. `.env.example` documents every variable. |
| Never hardcode secrets | No secret is in the source. A weak or placeholder `JWT_SECRET` stops startup. |
| Do not commit `.env` | `.gitignore` excludes it. |

### Documentation and structure (rubric: Code Organization and Documentation, 10%)

The layout follows the brief's recommended MVC tree:

```
config/        db.js, config.js
controllers/   authController.js, taskController.js, userController.js
middleware/    authMiddleware.js, roleMiddleware.js, notFound + error handlers
models/        User.js, Task.js
routes/        authRoutes.js, taskRoutes.js, userRoutes.js
db/            schema.sql, init.js, createAdmin.js
tests/         5 suites (auth 21, api 78, admin 17, config 10, docs 32 tests)
docs/          this guide, LAB_EXPLANATION.md, postman/
```

`userController.js` and `userRoutes.js` are additions, for the admin user list; the brief's tree has no equivalent.

Documents: the [README](../README.md) (setup, endpoints, errors, deployment), [LAB_EXPLANATION.md](LAB_EXPLANATION.md) (design decisions and request flow), the Postman collection, and live API docs at `/api-docs` (Swagger UI, described in `config/openapi.js`).

## 4. Rubric summary

| Criteria | Weight | Evidence |
|---|---|---|
| User registration and login | 20% | bcrypt hashing, validation, `409` on duplicates, identical `401` for bad logins; `tests/auth.test.js` (21 tests) |
| JWT authentication | 20% | Env secret (strong, no default), `1h` expiry, HS256 pinned, four distinct `401` cases; `tests/api.test.js`, `tests/config.test.js` |
| Protected routes | 20% | `router.use(authenticate)`, owner filter in SQL, `404` for others' tasks; ownership tests and Postman folder 3 |
| Role-based access control | 15% | `authorize`, admin-only `GET /api/users`, admin sees and manages all tasks; `tests/admin.test.js` |
| Error handling and security | 15% | One response format, correct status codes, generic `5xx` messages, env-only secrets |
| Organization and documentation | 10% | MVC layout, this guide, README, lab explanation, Postman collection |

## 5. Where this differs from the brief

These are deliberate. Each is also noted in the README or LAB_EXPLANATION.

| Brief | This project | Why |
|---|---|---|
| `PUT /api/tasks/:id`: "Task owner only" | Owner **or admin** | The brief also says admins "manage all tasks". `PATCH` is offered as well, for partial updates. |
| `DB_URI` in `.env` | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | The project already configured PostgreSQL this way. |
| Task routes at `/api/tasks` | Same | Matches. |
| Auth routes at `/auth/*` | Served at `/auth/*` **and** `/api/auth/*` | The same handlers answer on both. |

## 6. Verification evidence

| Check | Result |
|---|---|
| `npm test` | 158 tests in 5 suites, all passing |
| Postman collection run with Newman against the live API | 28 requests, 48 assertions, 0 failed, and re-runnable |
| Tests prove they can fail | With the 500-message fix, the placeholder-secret check and the algorithm pin removed, the matching tests fail; they pass with the fixes in place |

## 7. Not implemented

The brief lists these as optional: refresh tokens, password reset, email verification, rate limiting, Helmet, activity logging, profile management, and logout and session invalidation. None of these is built. (Swagger UI, also optional, is implemented.)

Known limits:

- A token stays valid until it expires (default one hour), unless the user is deleted.
- Without rate limiting, login can be tried repeatedly.
- `/health` (task count) and `/db-test` are public.
- Tasks created before authentication have no owner and are visible only to admins.
