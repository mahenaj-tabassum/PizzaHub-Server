function notFound(req, res, next) {
  const error = new Error(`Route no found: ${req.method} - ${req.originalURL}`);
  error.status = 404;
  next(error);
}

export default notFound;
