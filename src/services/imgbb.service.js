import ApiError from "../utils/ApiError.js";
import { isAllowedImageUrl, MENU_IMAGE_HOSTS } from "../utils/imageUrl.js";

const IMGBB_API_URL = "https://api.imgbb.com/1/upload";

const uploadToImgBB = async (file) => {
  if (!file?.buffer || !file?.mimetype) {
    throw new ApiError(400, "A valid image file is required");
  }

  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new ApiError(500, "Image upload service is not configured");
  }

  const formData = new URLSearchParams();

  formData.set("key", apiKey);
  formData.set("image", file.buffer.toString("base64"));
  formData.set("name", file.originalname.replace(/\.[^/.]+$/, ""));

  let response;

  try {
    response = await fetch(IMGBB_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new ApiError(504, "Image upload service timed out");
    }

    throw new ApiError(502, "Could not connect to image upload service");
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw new ApiError(502, "Invalid response from image upload service");
  }

  if (!response.ok || !result?.success || !result?.data?.url) {
    throw new ApiError(502, result?.error?.message || "Image upload failed");
  }

  // ImgBB অপ্রত্যাশিত হোস্ট দিলে এখনই থামানো, যাতে পরে পেজ না ভাঙে
  if (!isAllowedImageUrl(result.data.url, MENU_IMAGE_HOSTS)) {
    console.error("ImgBB returned an unexpected image host:", result.data.url);
    throw new ApiError(502, "Image upload returned an unsupported URL");
  }

  return {
    url: result.data.url,
    displayUrl: result.data.display_url || result.data.url,
    deleteUrl: result.data.delete_url || null,
    imageId: result.data.id || null,
  };
};

export { uploadToImgBB };
