const app = require("./app");
const config = require("./config/config");

// Start server
app.listen(config.port, () => {
  console.log(
    `Server running in ${config.environment} mode on port ${config.port}`
  );
});
