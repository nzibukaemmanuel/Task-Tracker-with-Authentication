const express = require("express");

const router = express.Router();

const {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

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