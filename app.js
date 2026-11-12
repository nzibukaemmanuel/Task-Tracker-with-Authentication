require("dotenv").config();

const express = require("express");
const swaggerUi = require("swagger-ui-express");

const config = require("./config/config");
const pool = require("./config/db");
const openapi = require("./config/openapi");

const Task = require("./models/Task");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");

const notFoundMiddleware = require("./middleware/notFoundMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");

const app = express();

// Do not advertise the framework in the X-Powered-By header
app.disable("x-powered-by");

// Built-in middleware
app.use(express.json());

// Interactive API docs (Swagger UI): log in, click "Authorize", try the API.
// The raw OpenAPI description is at /api-docs.json.
app.get("/api-docs.json", (req, res) => res.status(200).json(openapi));
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openapi, {
    customSiteTitle: "Task Tracker API",
    swaggerOptions: { persistAuthorization: true },
  })
);

// Welcome route
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to the Task Tracker API with Authentication",
  });
});

// Health check: status, uptime (seconds) and number of tasks
app.get("/health", async (req, res, next) => {
  try {
    res.status(200).json({
      status: "ok",
      uptime: Math.round(process.uptime()),
      environment: config.environment,
      taskCount: await Task.count(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Database test endpoint: confirms the PostgreSQL connection works
app.get("/db-test", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.status(200).json({
      status: "success",
      message: "Database connection successful",
      time: result.rows[0].now,
    });
  } catch (error) {
    next(error);
  }
});

// Auth routes: register and login
// Served at /auth (as the lab spec names it) and /api/auth (alongside the
// other /api routes); both reach the same handlers.
app.use(["/auth", "/api/auth"], authRoutes);

// User routes (admin only)
app.use("/api/users", userRoutes);

// Task routes
app.use("/api/tasks", taskRoutes);

// Error handling middleware
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
