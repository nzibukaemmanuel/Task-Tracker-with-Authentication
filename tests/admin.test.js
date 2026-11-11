const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const createAdmin = require("../db/createAdmin");
const { authorize } = require("../middleware/roleMiddleware");

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  console.error.mockRestore();
  await pool.end();
});

beforeEach(async () => {
  await pool.query("TRUNCATE TABLE tasks, users RESTART IDENTITY");
});

const login = (email, password) =>
  request(app).post("/api/auth/login").send({ email, password });

describe("createAdmin (npm run create-admin)", () => {
  test("creates an admin who can log in", async () => {
    const admin = await createAdmin({
      email: "Admin@Example.com",
      password: "adminpass123",
    });

    expect(admin).toMatchObject({ email: "admin@example.com", role: "admin" });

    const res = await login("admin@example.com", "adminpass123");
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("admin");
  });

  test("stores a hash, not the password", async () => {
    await createAdmin({ email: "admin@example.com", password: "adminpass123" });

    const { rows } = await pool.query("SELECT password_hash FROM users");

    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  test("promotes an existing user and keeps their tasks", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada", email: "ada@example.com", password: "password123" });
    await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .send({ title: "Mine" });

    const admin = await createAdmin({
      email: "ada@example.com",
      password: "newpassword1",
    });

    expect(admin.id).toBe(reg.body.data.id);
    expect(admin.role).toBe("admin");
    expect((await pool.query("SELECT 1 FROM tasks")).rowCount).toBe(1);
    expect((await login("ada@example.com", "newpassword1")).status).toBe(200);
  });

  test("is safe to run twice", async () => {
    await createAdmin({ email: "admin@example.com", password: "adminpass123" });
    await createAdmin({ email: "admin@example.com", password: "adminpass123" });

    expect((await pool.query("SELECT 1 FROM users")).rowCount).toBe(1);
  });

  test.each([
    ["missing email", { password: "adminpass123" }],
    ["invalid email", { email: "nope", password: "adminpass123" }],
    ["missing password", { email: "admin@example.com" }],
    ["short password", { email: "admin@example.com", password: "short" }],
  ])("rejects %s", async (_name, input) => {
    await expect(createAdmin(input)).rejects.toThrow();
  });

  test("an admin made this way sees all users' tasks", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada", email: "ada@example.com", password: "password123" });
    await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .send({ title: "Ada's task" });

    await createAdmin({ email: "admin@example.com", password: "adminpass123" });
    const { body } = await login("admin@example.com", "adminpass123");

    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${body.token}`);

    expect(res.body.count).toBe(1);
  });
});

describe("authorize middleware", () => {
  const run = (user, ...roles) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();
    authorize(...roles)({ user }, res, next);
    return { res, next };
  };

  test("lets a matching role through", () => {
    const { next, res } = run({ role: "admin" }, "admin");

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("blocks a non-matching role with 403", () => {
    const { next, res } = run({ role: "user" }, "admin");

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("blocks when there is no user (authenticate was skipped)", () => {
    const { next, res } = run(undefined, "admin");

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("GET /api/users (admin only)", () => {
  const register = async (email, name = "User") =>
    (
      await request(app)
        .post("/api/auth/register")
        .send({ name, email, password: "password123" })
    ).body;

  const adminToken = async () => {
    await createAdmin({ email: "admin@example.com", password: "adminpass123" });
    return (await login("admin@example.com", "adminpass123")).body.token;
  };

  test("an admin sees every user", async () => {
    await register("ada@example.com", "Ada");
    await register("bob@example.com", "Bob");

    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${await adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3); // Ada, Bob and the admin
    expect(res.body.data.map((u) => u.email)).toEqual(
      expect.arrayContaining(["ada@example.com", "bob@example.com", "admin@example.com"])
    );
  });

  test("never exposes passwords or hashes", async () => {
    await register("ada@example.com");

    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${await adminToken()}`);

    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|\$2[aby]\$/i);
  });

  test("a regular user is refused with 403", async () => {
    const { token } = await register("ada@example.com");

    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You do not have permission");
  });

  test("no token is refused with 401", async () => {
    const res = await request(app).get("/api/users");

    expect(res.status).toBe(401);
  });

  test("a promoted user gets access on their existing token only after the role changes", async () => {
    const { token } = await register("ada@example.com");
    expect(
      (await request(app).get("/api/users").set("Authorization", `Bearer ${token}`)).status
    ).toBe(403);

    await createAdmin({ email: "ada@example.com", password: "password123" });

    // The role is read from the database on each request, so the same token now works
    expect(
      (await request(app).get("/api/users").set("Authorization", `Bearer ${token}`)).status
    ).toBe(200);
  });
});
