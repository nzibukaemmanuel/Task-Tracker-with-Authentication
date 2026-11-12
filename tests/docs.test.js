const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const openapi = require("../config/openapi");

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  console.error.mockRestore();
  await pool.end();
});

const operations = Object.entries(openapi.paths).flatMap(([path, methods]) =>
  Object.keys(methods).map((method) => ({ path, method }))
);

describe("Swagger UI", () => {
  test("serves the interactive page at /api-docs", async () => {
    const res = await request(app).get("/api-docs/");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("swagger-ui");
  });

  test("serves the raw OpenAPI description at /api-docs.json", async () => {
    const res = await request(app).get("/api-docs.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe("Task Tracker with Authentication");
  });

  test("defines the Bearer token scheme behind the Authorize button", () => {
    expect(openapi.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  test("the docs page itself is public (no token needed to read it)", async () => {
    expect((await request(app).get("/api-docs/")).status).toBe(200);
  });
});

describe("The documentation matches the real routes", () => {
  test("documents every endpoint of the API", () => {
    const documented = operations.map((o) => `${o.method.toUpperCase()} ${o.path}`);

    expect(documented).toEqual(
      expect.arrayContaining([
        "POST /api/auth/register",
        "POST /api/auth/login",
        "GET /api/auth/me",
        "GET /api/tasks",
        "POST /api/tasks",
        "GET /api/tasks/{id}",
        "PUT /api/tasks/{id}",
        "PATCH /api/tasks/{id}",
        "DELETE /api/tasks/{id}",
        "GET /api/users",
      ])
    );
  });

  // If a documented route is renamed or removed, the API answers with the
  // "Route not found" 404 and this fails.
  test.each(operations.map((o) => [`${o.method.toUpperCase()} ${o.path}`, o]))(
    "%s exists",
    async (_label, { path, method }) => {
      const res = await request(app)[method](path.replace("{id}", "1"));

      expect(res.body.message || "").not.toMatch(/^Route not found/);
    }
  );

  test("every operation that sends a token is marked as secured", () => {
    const secured = operations
      .filter(({ path, method }) => openapi.paths[path][method].security)
      .map((o) => `${o.method.toUpperCase()} ${o.path}`);

    // Real behaviour: these answer 401 without a token
    expect(secured).toEqual(
      expect.arrayContaining(["GET /api/tasks", "GET /api/users", "GET /api/auth/me"])
    );
  });

  test.each(
    operations
      .filter(({ path, method }) => openapi.paths[path][method].security)
      .map((o) => [`${o.method.toUpperCase()} ${o.path}`, o])
  )("%s really requires a token", async (_label, { path, method }) => {
    const res = await request(app)[method](path.replace("{id}", "1"));

    expect(res.status).toBe(401);
  });

  test.each(
    operations
      .filter(({ path, method }) => !openapi.paths[path][method].security)
      .map((o) => [`${o.method.toUpperCase()} ${o.path}`, o])
  )("%s is public, as documented", async (_label, { path, method }) => {
    const res = await request(app)[method](path);

    expect(res.status).not.toBe(401);
  });
});
