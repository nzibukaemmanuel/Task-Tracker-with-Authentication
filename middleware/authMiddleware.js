const jwt = require("jsonwebtoken");

const config = require("../config/config");
const User = require("../models/userModel");

const unauthorized = (res, message) =>
  res.status(401).json({ success: false, message });

// AUTHENTICATION: "who is calling?"
// Expects the header:  Authorization: Bearer <token>
// On success it sets req.user, so every later handler knows the caller.
const authenticate = async (req, res, next) => {
  try {
    const [scheme, token] = (req.headers.authorization || "").split(" ");

    if (scheme !== "Bearer" || !token) {
      return unauthorized(res, "Authentication required");
    }

    // verify() checks the signature (made with JWT_SECRET) and the expiry.
    // A forged, tampered or expired token throws.
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      return unauthorized(res, "Invalid or expired token");
    }

    // A valid token is not enough: the user must still exist. This way a
    // deleted account stops working immediately, not when the token expires.
    const user = await User.findById(payload.sub);
    if (!user) return unauthorized(res, "User no longer exists");

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticate };
