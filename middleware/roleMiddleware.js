// AUTHORIZATION: "are you allowed to do this?"
// Use after authenticate (which sets req.user) to restrict a route by role:
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

module.exports = { authorize };
