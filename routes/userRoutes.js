const express = require("express");

const router = express.Router();

const { getAllUsers } = require("../controllers/userController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

// Order matters: authenticate first (who are you? -> 401),
// then authorize (are you an admin? -> 403).
router.use(authenticate, authorize("admin"));

// List all users
router.get("/", getAllUsers);

module.exports = router;
