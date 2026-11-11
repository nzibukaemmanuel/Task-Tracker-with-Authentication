// Point the app at a separate test database so the tests can wipe tables
// without touching real data. Runs before any app code is loaded.
require("dotenv").config();

const baseName = process.env.DB_NAME || "task_tracker_db";

process.env.DB_NAME = baseName.endsWith("_test") ? baseName : `${baseName}_test`;
process.env.NODE_ENV = "test";

// Tests sign and verify their own tokens. This value exists only inside the
// test run (never the app), so tests also pass on a machine with no .env.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-only-secret-not-for-real-use-0123456789";
