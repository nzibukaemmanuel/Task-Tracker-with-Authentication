const express = require("express");

const router = express.Router();

const { register, login } = require("../controllers/authController");

// Both routes are public: you cannot have a token before you log in
router.post("/register", register);
router.post("/login", login);

module.exports = router;
