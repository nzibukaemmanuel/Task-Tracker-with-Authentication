// The JWT secret signs every token. Anyone who knows it can forge a login for
// any user, including an admin, so there is deliberately NO default value:
// the app refuses to start without a strong one, in every environment.
const MIN_SECRET_LENGTH = 32;
const GENERATE_HINT =
  "generate one with: node -p \"require('crypto').randomBytes(32).toString('hex')\"";

const jwtSecret = (process.env.JWT_SECRET || "").trim();

if (!jwtSecret) {
  throw new Error(`JWT_SECRET is not set. Add it to your .env file (${GENERATE_HINT})`);
}

if (jwtSecret.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `JWT_SECRET is too short (${jwtSecret.length} characters; need at least ` +
      `${MIN_SECRET_LENGTH}). ${GENERATE_HINT}`
  );
}

// The placeholder from .env.example is public, so it is as good as no secret
if (/^change_me/i.test(jwtSecret)) {
  throw new Error(
    `JWT_SECRET is still the placeholder from .env.example. ${GENERATE_HINT}`
  );
}

const config = {
  port: process.env.PORT || 5000,
  environment: process.env.NODE_ENV || "development",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
};

module.exports = config;
