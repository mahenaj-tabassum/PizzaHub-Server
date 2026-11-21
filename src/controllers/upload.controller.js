import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { uploadToImgBB } from "../services/imgbb.service.js";

export const UploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Please select an image to upload");
  }

  const uploadedImage = await uploadToImgBB(req.file);

  return res.status(201).json({
    success: true,
    message: "Image uploaded successfully",
    data: {
      url: uploadedImage.url,
      displayUrl: uploadedImage.displayUrl,
      imageId: uploadedImage.imageId,
    },
  });
});
