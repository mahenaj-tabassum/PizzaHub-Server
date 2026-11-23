import multer from "multer";
import ApiError from "../utils/ApiError.js";

const isProduction = process.env.NODE_ENV === "production";

// User-friendly messages for upload errors.
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: "Image is too large. Maximum size is 4MB",
  LIMIT_FILE_COUNT: "Only one image can be uploaded at a time",
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field. Upload the image as "image"',
};

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let message = "Internal Server Error";

  if (err instanceof ApiError) {
    // Errors we threw on purpose: the message is safe to show.
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = MULTER_MESSAGES[err.code] || "Image upload failed";
  } else if (err.type === "entity.parse.failed") {
    // Broken JSON body (body-parser)
    statusCode = 400;
    message = "Invalid JSON in request body";
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Request body is too large";
  } else if (
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 500
  ) {
    // Other client errors, e.g. notFound middleware (404)
    statusCode = err.status;
    message = err.message;
  } else if (!isProduction) {
    // Unknown server error: show details only while developing.
    message = err.message || message;
  }

  // Always log server errors so they appear in Vercel Logs.
  if (statusCode >= 500) {
    console.error(`[${req.method}] ${req.originalUrl} ->`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
}

export default errorHandler;
