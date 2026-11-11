const express = require("express");

const router = express.Router();

const { getAllUsers } = require("../controllers/userController");
const { authenticate } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Order matters: authenticate first (who are you? -> 401),
// then authorize (are you an admin? -> 403).
router.use(authenticate, authorize("admin"));

// List all users
router.get("/", getAllUsers);

module.exports = router;
