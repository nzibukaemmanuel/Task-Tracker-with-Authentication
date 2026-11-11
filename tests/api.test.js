const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const pool = require("../config/db");
const config = require("../config/config");

// The error middleware logs every error; keep the test output readable.
beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  console.error.mockRestore();
  await pool.end();
});

// --- helpers ---------------------------------------------------------------
let token; // token of the default logged-in test user
let userId;

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// Authenticated request helpers; they send the default user's token
const api = {
  get: (url, t = token) => request(app).get(url).set(bearer(t)),
  post: (url, body, t = token) =>
    request(app).post(url).set(bearer(t)).send(body),
  patch: (url, body, t = token) =>
    request(app).patch(url).set(bearer(t)).send(body),
  delete: (url, t = token) => request(app).delete(url).set(bearer(t)),
};

const createTask = (body = { title: "Write tests" }) =>
  api.post("/api/tasks", body);

// Tests run against the separate *_test database; start each test empty,
// with one registered user whose token the helpers use.
beforeEach(async () => {
  await pool.query("TRUNCATE TABLE tasks, users RESTART IDENTITY");

  const res = await request(app).post("/api/auth/register").send({
    name: "Test User",
    email: "user@example.com",
    password: "password123",
  });
  token = res.body.token;
  userId = res.body.data.id;
});

describe("Welcome and health", () => {
  test("GET / returns the welcome message", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("GET /health reports status, uptime and task count", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.taskCount).toBe(0);
  });

  test("GET /health task count follows created and deleted tasks", async () => {
    const created = await createTask();
    await createTask({ title: "Second" });

    expect((await request(app).get("/health")).body.taskCount).toBe(2);

    await api.delete(`/api/tasks/${created.body.data.id}`);

    expect((await request(app).get("/health")).body.taskCount).toBe(1);
  });
});

describe("GET /db-test", () => {
  test("confirms the database connection", async () => {
    const res = await request(app).get("/db-test");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.time).toBeDefined();
  });

  test("returns 500 when the database fails", async () => {
    jest.spyOn(pool, "query").mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).get("/db-test");

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("Token verification (authenticate middleware)", () => {
  test.each([
    ["get", "/api/tasks"],
    ["get", "/api/tasks/1"],
    ["post", "/api/tasks"],
    ["patch", "/api/tasks/1"],
    ["delete", "/api/tasks/1"],
    ["get", "/api/auth/me"],
  ])("%s %s without a token returns 401", async (method, url) => {
    const res = await request(app)[method](url);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
  });

  test("rejects a header that is not a Bearer token", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Basic ${token}`);

    expect(res.status).toBe(401);
  });

  test("rejects a garbage token", async () => {
    const res = await api.get("/api/tasks", "not.a.token");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  test("rejects a token signed with the wrong secret", async () => {
    const forged = jwt.sign({ sub: userId }, "wrong-secret");

    expect((await api.get("/api/tasks", forged)).status).toBe(401);
  });

  test("rejects an expired token", async () => {
    const expired = jwt.sign({ sub: userId }, config.jwtSecret, {
      expiresIn: -10,
    });

    const res = await api.get("/api/tasks", expired);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  test("a valid token for a deleted user stops working", async () => {
    await pool.query("DELETE FROM users");

    const res = await api.get("/api/tasks");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("User no longer exists");
  });

  test("GET /api/auth/me returns the token's user", async () => {
    const res = await api.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: userId,
      email: "user@example.com",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  test("auth routes stay public", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "password123" });

    expect(res.status).toBe(200);
  });
});

describe("POST /api/tasks", () => {
  test("creates a task with defaults", async () => {
    const res = await createTask({ title: "  Buy milk  " });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "Buy milk",
      description: "",
      completed: false,
    });
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.createdAt).toBeDefined();
  });

  test.each([
    ["missing title", {}],
    ["empty title", { title: "   " }],
    ["non-string title", { title: 42 }],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await createTask(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("persists the task in the database", async () => {
    const { body } = await createTask({ title: "Stored", description: "d" });

    const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [
      body.data.id,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Stored", description: "d" });
  });

  test("rejects malformed JSON with 400", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set(bearer(token))
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /api/tasks", () => {
  test("returns an empty list at first", async () => {
    const res = await api.get("/api/tasks");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  test("returns all created tasks", async () => {
    await createTask({ title: "One" });
    await createTask({ title: "Two" });

    const res = await api.get("/api/tasks");

    expect(res.body.count).toBe(2);
  });

  test("returns one task by id", async () => {
    const { body } = await createTask();

    const res = await api.get(`/api/tasks/${body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Write tests");
  });

  test("returns 404 for an unknown id", async () => {
    const res = await api.get("/api/tasks/9999");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Task not found");
  });

  test.each(["does-not-exist", "-1", "1.5", "99999999999999"])(
    "returns 404 for invalid id %s",
    async (id) => {
      const res = await api.get(`/api/tasks/${id}`);

      expect(res.status).toBe(404);
    }
  );

  test("returns 500 when the database fails", async () => {
    // The first query is the middleware's user lookup; fail the second one
    const real = pool.query.bind(pool);
    jest
      .spyOn(pool, "query")
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(new Error("db down"));

    const res = await api.get("/api/tasks");

    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/tasks/:id", () => {
  test("updates only the fields sent", async () => {
    const { body } = await createTask({ title: "Old", description: "keep" });
    const { id, createdAt } = body.data;

    const res = await api.patch(`/api/tasks/${id}`, {
      title: "New",
      completed: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id,
      createdAt,
      title: "New",
      description: "keep",
      completed: true,
    });
  });

  test("cannot change id or createdAt", async () => {
    const { body } = await createTask();
    const { id, createdAt } = body.data;

    const res = await api.patch(`/api/tasks/${id}`, {
      id: "hacked",
      createdAt: "1999-01-01",
      completed: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.createdAt).toBe(createdAt);
  });

  test.each([
    ["empty body", {}],
    ["empty title", { title: "" }],
    ["non-string description", { description: 5 }],
    ["non-boolean completed", { completed: "yes" }],
  ])("rejects %s with 400", async (_name, payload) => {
    const { body } = await createTask();

    const res = await api.patch(`/api/tasks/${body.data.id}`, payload);

    expect(res.status).toBe(400);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await api.patch("/api/tasks/does-not-exist", {
      completed: true,
    });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id", () => {
  test("deletes a task", async () => {
    const { body } = await createTask();

    const res = await api.delete(`/api/tasks/${body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(body.data.id);

    const after = await api.get(`/api/tasks/${body.data.id}`);
    expect(after.status).toBe(404);
  });

  test("returns 404 when deleting twice", async () => {
    const { body } = await createTask();

    await api.delete(`/api/tasks/${body.data.id}`);
    const res = await api.delete(`/api/tasks/${body.data.id}`);

    expect(res.status).toBe(404);
  });
});

describe("Unknown routes", () => {
  test("return 404 JSON naming the route", async () => {
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("GET /nope");
  });
});

// --- ownership and admin access ---------------------------------------------
const registerOther = async (email = "other@example.com", name = "Other") => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name, email, password: "password123" });
  return res.body;
};

// Admins cannot be created through the API on purpose, so promote in SQL
const makeAdmin = async () => {
  const { token: t } = await registerOther("admin@example.com", "Admin");
  await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [
    "admin@example.com",
  ]);
  return t;
};

describe("Task ownership", () => {
  let otherToken;

  beforeEach(async () => {
    otherToken = (await registerOther()).token;
  });

  test("a new task is owned by the logged-in user, not by the request body", async () => {
    const { body } = await createTask({ title: "Mine", userId: 999 });

    expect(body.data.userId).toBe(userId);
  });

  test("users only see their own tasks in the list", async () => {
    await createTask({ title: "Mine" });
    await api.post("/api/tasks", { title: "Theirs" }, otherToken);

    const res = await api.get("/api/tasks");

    expect(res.body.count).toBe(1);
    expect(res.body.data[0].title).toBe("Mine");
  });

  test("another user's task looks like it does not exist (404)", async () => {
    const { body } = await createTask({ title: "Private" });
    const id = body.data.id;

    expect((await api.get(`/api/tasks/${id}`, otherToken)).status).toBe(404);
    expect(
      (await api.patch(`/api/tasks/${id}`, { completed: true }, otherToken))
        .status
    ).toBe(404);
    expect((await api.delete(`/api/tasks/${id}`, otherToken)).status).toBe(404);

    // ...and the task is untouched
    const after = await api.get(`/api/tasks/${id}`);
    expect(after.status).toBe(200);
    expect(after.body.data.completed).toBe(false);
  });

  test("cannot change the owner through PATCH", async () => {
    const { body } = await createTask();

    const res = await api.patch(`/api/tasks/${body.data.id}`, {
      userId: 999,
      completed: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(userId);
  });

  test("deleting a user deletes their tasks", async () => {
    await createTask();
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    const { rows } = await pool.query("SELECT 1 FROM tasks");
    expect(rows).toHaveLength(0);
  });
});

describe("Admin access", () => {
  let adminToken;

  beforeEach(async () => {
    adminToken = await makeAdmin();
  });

  test("an admin sees every user's tasks", async () => {
    await createTask({ title: "User task" });

    const res = await api.get("/api/tasks", adminToken);

    expect(res.body.count).toBe(1);
    expect(res.body.data[0].title).toBe("User task");
  });

  test("an admin can read, update and delete any user's task", async () => {
    const { body } = await createTask({ title: "User task" });
    const id = body.data.id;

    expect((await api.get(`/api/tasks/${id}`, adminToken)).status).toBe(200);

    const updated = await api.patch(
      `/api/tasks/${id}`,
      { completed: true },
      adminToken
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data.completed).toBe(true);

    expect((await api.delete(`/api/tasks/${id}`, adminToken)).status).toBe(200);
    expect((await api.get(`/api/tasks/${id}`)).status).toBe(404);
  });

  test("a task an admin creates belongs to the admin", async () => {
    const res = await api.post("/api/tasks", { title: "Admin's" }, adminToken);

    expect(res.body.data.userId).not.toBe(userId);
    expect((await api.get("/api/tasks")).body.count).toBe(0);
  });

  test("tasks with no owner are visible to admins only", async () => {
    await pool.query("INSERT INTO tasks (title) VALUES ('legacy')");

    expect((await api.get("/api/tasks")).body.count).toBe(0);
    expect((await api.get("/api/tasks", adminToken)).body.count).toBe(1);
  });
});
