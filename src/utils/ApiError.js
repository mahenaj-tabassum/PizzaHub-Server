class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.status = statusCode;
    this.details = details;

    Error.captureStackTrace?.(this, this.constructor);
  }
}

export default ApiError;
