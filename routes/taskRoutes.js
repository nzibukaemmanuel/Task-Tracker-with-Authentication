const express = require("express");

const router = express.Router();

const {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

const { authenticate } = require("../middleware/authMiddleware");

// Every task route requires a valid token. Router-level middleware runs for
// all the routes below it, so no route can be added without protection.
router.use(authenticate);

// Get all tasks
router.get("/", getAllTasks);

// Get a task by ID
router.get("/:id", getTaskById);

// Create a task
router.post("/", createTask);

// Update a task
router.patch("/:id", updateTask);

// Delete a task
router.delete("/:id", deleteTask);

module.exports = router;