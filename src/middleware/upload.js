import multer from "multer";
import ApiError from "../utils/ApiError.js";

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.mimetype)) {
    return callback(
      new ApiError(400, "Only JPEG, PNG and WebP images are allowed"),
    );
  }

  callback(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    // Vercel ফাংশনের রিকোয়েস্ট বডির সীমা ৪.৫MB, তাই ৪MB।
    fileSize: 4 * 1024 * 1024,
    files: 1,
  },
});

export default upload;
