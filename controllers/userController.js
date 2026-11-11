const User = require("../models/userModel");

// GET /api/users (admin only: enforced by the route, see userRoutes.js)
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.getAll();

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllUsers };
