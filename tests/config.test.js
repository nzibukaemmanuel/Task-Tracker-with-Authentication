// A valid secret: 64 hex characters, like `randomBytes(32).toString("hex")`
const STRONG = "0123456789abcdef".repeat(4);

// Loads config/config.js fresh under a given environment
const loadConfig = (env) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
  }

  try {
    let config;
    jest.isolateModules(() => {
      config = require("../config/config");
    });
    return config;
  } finally {
    process.env = saved;
  }
};

describe("config", () => {
  test("reads the JWT secret and expiry from the environment", () => {
    const config = loadConfig({ JWT_SECRET: STRONG, JWT_EXPIRES_IN: "2h" });

    expect(config.jwtSecret).toBe(STRONG);
    expect(config.jwtExpiresIn).toBe("2h");
  });

  test("token expiry defaults to 1h", () => {
    const config = loadConfig({ JWT_SECRET: STRONG, JWT_EXPIRES_IN: undefined });

    expect(config.jwtExpiresIn).toBe("1h");
  });

  test.each(["development", "test", "production"])(
    "refuses to start without JWT_SECRET in %s",
    (NODE_ENV) => {
      expect(() => loadConfig({ NODE_ENV, JWT_SECRET: undefined })).toThrow(
        /JWT_SECRET is not set/
      );
    }
  );

  test.each(["", "   "])("treats a blank secret (%j) as missing", (blank) => {
    expect(() => loadConfig({ JWT_SECRET: blank })).toThrow(/JWT_SECRET/);
  });

  test("rejects a secret shorter than 32 characters", () => {
    expect(() => loadConfig({ JWT_SECRET: "x".repeat(31) })).toThrow(
      /too short \(31 characters/
    );
  });

  test("accepts a secret of exactly 32 characters", () => {
    const secret = "x".repeat(32);

    expect(loadConfig({ JWT_SECRET: secret }).jwtSecret).toBe(secret);
  });

  test("rejects the placeholder from .env.example", () => {
    const placeholder = require("fs")
      .readFileSync(require("path").join(__dirname, "../.env.example"), "utf8")
      .match(/^JWT_SECRET=(.*)$/m)[1]
      .trim();

    // It is long enough, so only the placeholder check can catch it
    expect(placeholder.length).toBeGreaterThanOrEqual(32);
    expect(() => loadConfig({ JWT_SECRET: placeholder })).toThrow(
      /placeholder/
    );
  });
});
