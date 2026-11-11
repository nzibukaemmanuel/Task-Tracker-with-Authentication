require("dotenv").config();

const express = require("express");

const config = require("./config/config");
const pool = require("./config/db");

const Task = require("./models/taskModel");
const authRoutes = require("./routes/authRoutes");
const taskRoutes =require("./routes/taskRoutes");

const notFoundMiddleware = require("./middleware/notFoundMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");

const app = express();

// Do not advertise the framework in the X-Powered-By header
app.disable("x-powered-by");

// Built-in middleware
app.use(express.json());

// Welcome route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to the RESTful Task Tracker API",
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
      success: true,
      message: "Database connection successful",
      time: result.rows[0].now,
    });
  } catch (error) {
    next(error);
  }
});

// Auth routes: register and login
app.use("/api/auth", authRoutes);

// Task routes
app.use("/api/tasks", taskRoutes);

// Error handling middleware
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
