const errorMiddleware = (err, req, res, next) => {
  // The full error (message and stack) always goes to the server log...
  console.error(err.stack);

  const statusCode = err.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === "development";

  // ...but clients of a 5xx never see it outside development: messages from
  // the database or other internals (hostnames, user names, SQL, file paths)
  // help attackers. 4xx messages are written for the client, so they are kept.
  const message =
    statusCode >= 500 && !isDevelopment
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

  res.status(statusCode).json({
    status: "error",
    message,
    ...(isDevelopment && { stack: err.stack }),
  });
};

module.exports = errorMiddleware;
