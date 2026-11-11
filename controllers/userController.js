const User = require("../models/User");

// GET /api/users (admin only: enforced by the route, see userRoutes.js)
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.getAll();

    res.status(200).json({
      status: "success",
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllUsers };
