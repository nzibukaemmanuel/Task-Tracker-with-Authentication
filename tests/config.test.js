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
    const config = loadConfig({ JWT_SECRET: "abc123", JWT_EXPIRES_IN: "2h" });

    expect(config.jwtSecret).toBe("abc123");
    expect(config.jwtExpiresIn).toBe("2h");
  });

  test("token expiry defaults to 1h", () => {
    const config = loadConfig({ JWT_SECRET: "abc123", JWT_EXPIRES_IN: undefined });

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
});
