const jwt = require("jsonwebtoken");

const config = require("../config/config");
const User = require("../models/userModel");

const unauthorized = (res, message) =>
  res.status(401).json({ success: false, message });

// AUTHENTICATION: "who are you?"
// Expects `Authorization: Bearer <token>`. On success it sets req.user so
// every later handler knows who is calling.
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return unauthorized(res, "Authentication required");
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      return unauthorized(res, "Invalid or expired token");
    }

    const user = await User.findById(payload.sub);
    if (!user) return unauthorized(res, "User no longer exists");

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// AUTHORIZATION: "are you allowed to do this?"
// Usage: authorize("admin") after authenticate.
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have permission" });
    }
    next();
  };

module.exports = { authenticate, authorize };
