const jwt = require("jsonwebtoken");

const config = require("../config/config");
const User = require("../models/userModel");

const unauthorized = (res, message) =>
  res.status(401).json({ status: "error", message });

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
    } catch (error) {
      // Tell the client WHY, so an app knows whether to ask the user to log
      // in again (expired) or treat the token as broken (invalid).
      return unauthorized(
        res,
        error instanceof jwt.TokenExpiredError
          ? "Token expired"
          : "Invalid token"
      );
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

// AUTHORIZATION: "are you allowed to do this?"
// Use after authenticate to restrict a route to certain roles, e.g.
//   router.get("/users", authenticate, authorize("admin"), listUsers);
// 401 = we don't know who you are; 403 = we know, and you may not do this.
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ status: "error", message: "You do not have permission" });
    }
    next();
  };

module.exports = { authenticate, authorize };
