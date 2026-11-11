// The JWT secret signs every token. Anyone who knows it can forge a login for
// any user, including an admin, so there is deliberately NO default value:
// the app refuses to start without one, in every environment.
const jwtSecret = (process.env.JWT_SECRET || "").trim();

if (!jwtSecret) {
  throw new Error(
    "JWT_SECRET is not set. Add it to your .env file " +
      "(generate one with: node -p \"require('crypto').randomBytes(32).toString('hex')\")"
  );
}

const config = {
  port: process.env.PORT || 5000,
  environment: process.env.NODE_ENV || "development",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
};

module.exports = config;
