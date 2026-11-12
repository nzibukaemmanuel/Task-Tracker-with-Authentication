// OpenAPI 3 description of the API, shown by Swagger UI at /api-docs.
// Keep it in step with the routes: tests/docs.test.js fails if a documented
// route does not exist.

const bearer = [{ bearerAuth: [] }];

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const json = (schema, example) => ({
  "application/json": { schema, ...(example && { example }) },
});

const error = (description, message) => ({
  description,
  content: json(ref("Error"), { status: "error", message }),
});

const unauthorized = error(
  "Missing, invalid or expired token",
  "Authentication required"
);
const notFound = error("Task not found (or it belongs to someone else)", "Task not found");

const idParam = {
  name: "id",
  in: "path",
  required: true,
  description: "Task id (an integer)",
  schema: { type: "integer", minimum: 1 },
  example: 1,
};

const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Task Tracker with Authentication",
    version: "1.0.0",
    description: [
      "A task API secured with **JWT authentication** and **role-based access control**.",
      "",
      "### How to try it here",
      "1. Open **POST /api/auth/register** (or **/login**), click **Try it out**, then **Execute**.",
      "2. Copy the `token` from the response body.",
      "3. Click the green **Authorize** button at the top, paste the token (no `Bearer ` prefix), and click **Authorize**.",
      "4. Every padlocked endpoint now sends your token. Try **POST /api/tasks**, then **GET /api/tasks**.",
      "",
      "### Roles",
      "- **user**: manages only their own tasks.",
      "- **admin**: manages all tasks and can list all users. Admins cannot be created through the API; run `npm run create-admin`.",
      "",
      "Tokens expire after `JWT_EXPIRES_IN` (default 1 hour). When you see `Token expired`, log in again and re-authorize.",
      "",
      "The auth routes are also served at `/auth/register` and `/auth/login`.",
    ].join("\n"),
  },
  tags: [
    { name: "Auth", description: "Register, log in and identify the current user" },
    { name: "Tasks", description: "Requires a token. Users see their own tasks; admins see all" },
    { name: "Users", description: "Admin only" },
    { name: "System", description: "Welcome, health and database checks" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste the `token` returned by register or login.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          status: { type: "string", example: "error" },
          message: { type: "string" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Ada Lovelace" },
          email: { type: "string", example: "ada@example.com" },
          role: { type: "string", enum: ["user", "admin"], example: "user" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          title: { type: "string", example: "Write the report" },
          description: { type: "string", example: "First draft by Friday" },
          completed: { type: "boolean", example: false },
          userId: { type: "integer", nullable: true, description: "The owner", example: 1 },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", example: "Ada Lovelace" },
          email: { type: "string", example: "ada@example.com" },
          password: { type: "string", minLength: 8, example: "password123" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", example: "ada@example.com" },
          password: { type: "string", example: "password123" },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "success" },
          message: { type: "string" },
          token: { type: "string", description: "Send as `Authorization: Bearer <token>`" },
          data: ref("User"),
        },
      },
      TaskCreate: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", maxLength: 255, example: "Write the report" },
          description: { type: "string", example: "First draft by Friday" },
        },
      },
      TaskReplace: {
        type: "object",
        description: "Full replacement: omitted fields reset to their defaults.",
        required: ["title"],
        properties: {
          title: { type: "string", maxLength: 255, example: "Write the report (final)" },
          description: { type: "string", default: "", example: "" },
          completed: { type: "boolean", default: false, example: false },
        },
      },
      TaskUpdate: {
        type: "object",
        description: "Partial update: send at least one field.",
        properties: {
          title: { type: "string", maxLength: 255 },
          description: { type: "string" },
          completed: { type: "boolean", example: true },
        },
      },
    },
  },
  paths: {
    "/": {
      get: {
        tags: ["System"],
        summary: "Welcome message",
        responses: { 200: { description: "Welcome" } },
      },
    },
    "/health": {
      get: {
        tags: ["System"],
        summary: "Status, uptime and total task count",
        responses: { 200: { description: "Healthy" } },
      },
    },
    "/db-test": {
      get: {
        tags: ["System"],
        summary: "Confirms the database connection",
        responses: { 200: { description: "Connected" }, 500: error("Database unreachable", "Internal Server Error") },
      },
    },

    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create an account and get a token",
        description:
          "The role is always `user`: a `role` in the body is ignored. Passwords are stored as bcrypt hashes.",
        requestBody: { required: true, content: json(ref("RegisterRequest")) },
        responses: {
          201: { description: "Registered. Copy the token", content: json(ref("AuthResponse")) },
          400: error("Invalid name, email or password", "Password must be at least 8 characters"),
          409: error("Email already registered", "Email is already registered"),
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in and get a token",
        description:
          "A wrong password and an unknown email give the same message, so login cannot be used to find registered emails.",
        requestBody: { required: true, content: json(ref("LoginRequest")) },
        responses: {
          200: { description: "Logged in. Copy the token", content: json(ref("AuthResponse")) },
          400: error("Email or password missing", "Email and password are required"),
          401: error("Wrong credentials", "Invalid email or password"),
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "The current user",
        security: bearer,
        responses: {
          200: {
            description: "The user the token belongs to",
            content: json({
              type: "object",
              properties: { status: { type: "string", example: "success" }, data: ref("User") },
            }),
          },
          401: unauthorized,
        },
      },
    },

    "/api/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "List tasks (your own; admins see all)",
        security: bearer,
        responses: {
          200: {
            description: "Tasks",
            content: json({
              type: "object",
              properties: {
                status: { type: "string", example: "success" },
                count: { type: "integer" },
                data: { type: "array", items: ref("Task") },
              },
            }),
          },
          401: unauthorized,
        },
      },
      post: {
        tags: ["Tasks"],
        summary: "Create a task you own",
        description: "The owner is taken from your token; a `userId` in the body is ignored.",
        security: bearer,
        requestBody: { required: true, content: json(ref("TaskCreate")) },
        responses: {
          201: {
            description: "Created",
            content: json({
              type: "object",
              properties: {
                status: { type: "string", example: "success" },
                message: { type: "string" },
                data: ref("Task"),
              },
            }),
          },
          400: error("Missing or invalid title", "A valid task title is required"),
          401: unauthorized,
        },
      },
    },
    "/api/tasks/{id}": {
      get: {
        tags: ["Tasks"],
        summary: "Get one task (owner or admin)",
        security: bearer,
        parameters: [idParam],
        responses: {
          200: {
            description: "The task",
            content: json({
              type: "object",
              properties: { status: { type: "string", example: "success" }, data: ref("Task") },
            }),
          },
          401: unauthorized,
          404: notFound,
        },
      },
      put: {
        tags: ["Tasks"],
        summary: "Replace a task (owner or admin)",
        description: "`title` is required; omitted `description` and `completed` reset to their defaults.",
        security: bearer,
        parameters: [idParam],
        requestBody: { required: true, content: json(ref("TaskReplace")) },
        responses: {
          200: { description: "Replaced", content: json({ type: "object", properties: { status: { type: "string" }, message: { type: "string" }, data: ref("Task") } }) },
          400: error("Invalid fields", "PUT replaces the whole task: a non-empty title is required"),
          401: unauthorized,
          404: notFound,
        },
      },
      patch: {
        tags: ["Tasks"],
        summary: "Update some fields of a task (owner or admin)",
        security: bearer,
        parameters: [idParam],
        requestBody: { required: true, content: json(ref("TaskUpdate")) },
        responses: {
          200: { description: "Updated", content: json({ type: "object", properties: { status: { type: "string" }, message: { type: "string" }, data: ref("Task") } }) },
          400: error("No fields, or an invalid field", "Please provide at least one field to update"),
          401: unauthorized,
          404: notFound,
        },
      },
      delete: {
        tags: ["Tasks"],
        summary: "Delete a task (owner or admin)",
        security: bearer,
        parameters: [idParam],
        responses: {
          200: { description: "Deleted", content: json({ type: "object", properties: { status: { type: "string" }, message: { type: "string" }, data: ref("Task") } }) },
          401: unauthorized,
          404: notFound,
        },
      },
    },

    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List all users (admin only)",
        description: "A regular user gets `403`. Password hashes are never returned.",
        security: bearer,
        responses: {
          200: {
            description: "All users",
            content: json({
              type: "object",
              properties: {
                status: { type: "string", example: "success" },
                count: { type: "integer" },
                data: { type: "array", items: ref("User") },
              },
            }),
          },
          401: unauthorized,
          403: error("Not an admin", "You do not have permission"),
        },
      },
    },
  },
};

module.exports = openapi;
