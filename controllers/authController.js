const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const config = require("../config/config");
const User = require("../models/userModel");

const BCRYPT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A token carries only the user id; role is re-read from the database on
// every request so a demoted or deleted user loses access immediately.
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

    // Role is never read from the request body: nobody can self-register as
    // an admin. Admins are created with `npm run create-admin`.
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
    if (error.code === "23505") {
      // PostgreSQL unique_violation on users.email
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

    // Same message for "no such email" and "wrong password" so attackers
    // cannot discover which emails are registered.
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

// GET /api/auth/me
const me = (req, res) => {
  res.status(200).json({ success: true, data: req.user });
};

module.exports = { register, login, me };
