const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const config = require("../config/config");
const User = require("../models/userModel");

const BCRYPT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The token carries only the user id. Anything else (like the role) is
// looked up in the database when needed, so it can never go stale.
const signToken = (user) =>
  jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

const badRequest = (res, message) =>
  res.status(400).json({ success: false, message });

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return badRequest(res, "A name is required");
    }
    if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
      return badRequest(res, "A valid email is required");
    }
    if (typeof password !== "string" || password.length < 8) {
      return badRequest(res, "Password must be at least 8 characters");
    }

    // The role is never read from the request body, so nobody can register
    // themselves as an admin: the database default ('user') always applies.
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    });

    res.status(201).json({
      success: true,
      message: "Registered successfully",
      token: signToken(user),
      data: user,
    });
  } catch (error) {
    // PostgreSQL unique_violation: the email is already taken
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ success: false, message: "Email is already registered" });
    }
    next(error);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return badRequest(res, "Email and password are required");
    }

    const user = await User.findByEmailWithPassword(email.trim().toLowerCase());

    // One message for "no such email" and "wrong password", so an attacker
    // cannot use login to discover which emails are registered.
    const valid = user && (await bcrypt.compare(password, user.passwordHash));
    if (!valid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    delete user.passwordHash;

    res.status(200).json({
      success: true,
      message: "Logged in successfully",
      token: signToken(user),
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login };
