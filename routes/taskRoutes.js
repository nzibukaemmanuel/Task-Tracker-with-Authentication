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

// Every task route requires a logged-in user. This one line is what closes
// the "all routes are public" hole; the controllers then scope by owner.
router.use(authenticate);

// Get all tasks (own tasks, or every task for admins)
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