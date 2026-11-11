const express = require("express");

const router = express.Router();

const { register, login, me } = require("../controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");

// Public: you cannot have a token before you log in
router.post("/register", register);
router.post("/login", login);

// Protected: returns whoever the token belongs to
router.get("/me", authenticate, me);

module.exports = router;
