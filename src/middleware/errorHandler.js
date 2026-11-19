function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = err.status || 500;

  res.status(statusCode).json({
    status: false,
    message: err.message || "Internal Server Error",
  });
}

export default errorHandler;
