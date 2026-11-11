const Task = require("../models/taskModel");

// Task ids are database integers; anything else cannot exist
const isValidId = (id) => /^\d+$/.test(id) && Number(id) <= 2147483647;

const notFound = (res) =>
  res.status(404).json({ success: false, message: "Task not found" });

// GET /api/tasks
const getAllTasks = async (req, res, next) => {
  try {
    const tasks = await Task.getAll();

    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/tasks/:id
const getTaskById = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return notFound(res);

    const task = await Task.getById(req.params.id);
    if (!task) return notFound(res);

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

// POST /api/tasks
const createTask = async (req, res, next) => {
  try {
    const { title, description } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid task title is required",
      });
    }

    const newTask = await Task.create({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
    });

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: newTask,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/tasks/:id
const updateTask = async (req, res, next) => {
  try {
    const { title, description, completed } = req.body;

    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one field to update",
      });
    }

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return res.status(400).json({
        success: false,
        message: "Title must be a non-empty string",
      });
    }

    if (description !== undefined && typeof description !== "string") {
      return res.status(400).json({
        success: false,
        message: "Description must be a string",
      });
    }

    if (completed !== undefined && typeof completed !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Completed must be a boolean",
      });
    }

    if (!isValidId(req.params.id)) return notFound(res);

    const updatedTask = await Task.update(req.params.id, {
      title: title !== undefined ? title.trim() : undefined,
      description: description !== undefined ? description.trim() : undefined,
      completed,
    });

    if (!updatedTask) return notFound(res);

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/tasks/:id
const deleteTask = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return notFound(res);

    const deletedTask = await Task.delete(req.params.id);
    if (!deletedTask) return notFound(res);

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
      data: deletedTask,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
};
