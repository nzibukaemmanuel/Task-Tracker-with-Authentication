// Point the app at a separate test database so the tests can wipe tables
// without touching real data. Runs before any app code is loaded.
require("dotenv").config();

const baseName = process.env.DB_NAME || "task_tracker_db";

process.env.DB_NAME = baseName.endsWith("_test") ? baseName : `${baseName}_test`;
process.env.NODE_ENV = "test";
