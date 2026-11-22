import { z } from "zod";

// next.config.ts এর images.remotePatterns এর সাথে মিল রাখতে হবে।
// কোনো হোস্ট যোগ করলে দুই জায়গাতেই যোগ করুন।
export const MENU_IMAGE_HOSTS = Object.freeze([
  "i.ibb.co",
  "i.ibb.co.com",
  "images.unsplash.com",
]);

// প্রোফাইল ছবি শুধু আমাদের ImgBB আপলোড থেকে আসে
export const PROFILE_IMAGE_HOSTS = Object.freeze(["i.ibb.co", "i.ibb.co.com"]);

// শুধু https এবং অনুমোদিত হোস্ট। কোনো ক্রেডেনশিয়াল (user:pass@) থাকলেও বাতিল।
export const isAllowedImageUrl = (value, hosts) => {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      hosts.includes(url.hostname)
    );
  } catch {
    return false;
  }
};

export const imageUrlSchema = (hosts) =>
  z
    .string()
    .trim()
    .max(500, "Image URL is too long")
    .url("Each image must be a valid URL")
    .refine(
      (value) => isAllowedImageUrl(value, hosts),
      "Images must be uploaded through PizzaHub",
    );
