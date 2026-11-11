const environment = process.env.NODE_ENV || "development";

// The JWT secret signs every token. If it leaks, anyone can forge a login,
// so production refuses to start without one.
if (environment === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

const config = {
  port: process.env.PORT || 5000,
  environment,
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
};

module.exports = config;
