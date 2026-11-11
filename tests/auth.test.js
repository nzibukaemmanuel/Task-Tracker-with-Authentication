const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const pool = require("../config/db");
const config = require("../config/config");

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  console.error.mockRestore();
  await pool.end();
});

// Tests run against the separate *_test database; start each test with no users.
beforeEach(async () => {
  await pool.query("TRUNCATE TABLE tasks, users RESTART IDENTITY");
});

const valid = {
  name: "Test User",
  email: "user@example.com",
  password: "password123",
};

const register = (overrides = {}) =>
  request(app)
    .post("/api/auth/register")
    .send({ ...valid, ...overrides });

const login = (body) => request(app).post("/api/auth/login").send(body);

describe("POST /api/auth/register", () => {
  test("creates a user and returns a token", async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.data).toMatchObject({
      name: "Test User",
      email: "user@example.com",
      role: "user",
    });
  });

  test("never returns the password or its hash", async () => {
    const res = await register();

    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  test("stores a bcrypt hash, not the password", async () => {
    await register();

    const { rows } = await pool.query("SELECT password_hash FROM users");

    expect(rows[0].password_hash).not.toBe("password123");
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  test("the token holds the user id and expires", async () => {
    const res = await register();

    const payload = jwt.verify(res.body.token, config.jwtSecret);

    expect(payload.sub).toBe(res.body.data.id);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  test("normalises the email (trim + lowercase)", async () => {
    const res = await register({ email: "  User@Example.COM " });

    expect(res.body.data.email).toBe("user@example.com");
  });

  test("cannot register as an admin", async () => {
    const res = await register({ role: "admin" });

    expect(res.body.data.role).toBe("user");
  });

  test("rejects a duplicate email with 409, ignoring case", async () => {
    await register();
    const res = await register({ email: "USER@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Email is already registered");
  });

  test.each([
    ["missing name", { name: "  " }],
    ["non-string name", { name: 5 }],
    ["invalid email", { email: "not-an-email" }],
    ["missing email", { email: undefined }],
    ["short password", { password: "short" }],
    ["non-string password", { password: 12345678 }],
  ])("rejects %s with 400", async (_name, overrides) => {
    const res = await register(overrides);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await register();
  });

  test("returns a token for correct credentials", async () => {
    const res = await login({ email: "user@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("user@example.com");
    expect(jwt.verify(res.body.token, config.jwtSecret).sub).toBe(
      res.body.data.id
    );
  });

  test("never returns the password or its hash", async () => {
    const res = await login({ email: "user@example.com", password: "password123" });

    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  test("email is case-insensitive", async () => {
    const res = await login({ email: "USER@Example.com", password: "password123" });

    expect(res.status).toBe(200);
  });

  test.each([
    ["wrong password", { email: "user@example.com", password: "wrongpass1" }],
    ["unknown email", { email: "ghost@example.com", password: "password123" }],
  ])("rejects %s with an identical 401", async (_name, creds) => {
    const res = await login(creds);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  test.each([
    ["no body", {}],
    ["missing password", { email: "user@example.com" }],
    ["non-string email", { email: 1, password: "password123" }],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await login(body);

    expect(res.status).toBe(400);
  });
});
