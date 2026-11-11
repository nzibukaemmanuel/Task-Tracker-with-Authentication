const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");

// The error middleware logs every error; keep the test output readable.
beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  console.error.mockRestore();
  await pool.end();
});

// Tests run against the separate *_test database; start each test empty.
beforeEach(async () => {
  await pool.query("TRUNCATE TABLE tasks RESTART IDENTITY");
});

const createTask = (body = { title: "Write tests" }) =>
  request(app).post("/api/tasks").send(body);

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

    await request(app).delete(`/api/tasks/${created.body.data.id}`);

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
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("GET /api/tasks", () => {
  test("returns an empty list at first", async () => {
    const res = await request(app).get("/api/tasks");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  test("returns all created tasks", async () => {
    await createTask({ title: "One" });
    await createTask({ title: "Two" });

    const res = await request(app).get("/api/tasks");

    expect(res.body.count).toBe(2);
  });

  test("returns one task by id", async () => {
    const { body } = await createTask();

    const res = await request(app).get(`/api/tasks/${body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Write tests");
  });

  test("returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/tasks/9999");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Task not found");
  });

  test.each(["does-not-exist", "-1", "1.5", "99999999999999"])(
    "returns 404 for invalid id %s",
    async (id) => {
      const res = await request(app).get(`/api/tasks/${id}`);

      expect(res.status).toBe(404);
    }
  );

  test("returns 500 when the database fails", async () => {
    jest.spyOn(pool, "query").mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).get("/api/tasks");

    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/tasks/:id", () => {
  test("updates only the fields sent", async () => {
    const { body } = await createTask({ title: "Old", description: "keep" });
    const { id, createdAt } = body.data;

    const res = await request(app)
      .patch(`/api/tasks/${id}`)
      .send({ title: "New", completed: true });

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

    const res = await request(app)
      .patch(`/api/tasks/${id}`)
      .send({ id: "hacked", createdAt: "1999-01-01", completed: true });

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

    const res = await request(app)
      .patch(`/api/tasks/${body.data.id}`)
      .send(payload);

    expect(res.status).toBe(400);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await request(app)
      .patch("/api/tasks/does-not-exist")
      .send({ completed: true });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id", () => {
  test("deletes a task", async () => {
    const { body } = await createTask();

    const res = await request(app).delete(`/api/tasks/${body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(body.data.id);

    const after = await request(app).get(`/api/tasks/${body.data.id}`);
    expect(after.status).toBe(404);
  });

  test("returns 404 when deleting twice", async () => {
    const { body } = await createTask();

    await request(app).delete(`/api/tasks/${body.data.id}`);
    const res = await request(app).delete(`/api/tasks/${body.data.id}`);

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
