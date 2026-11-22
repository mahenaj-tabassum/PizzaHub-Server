import { z } from "zod";
import { imageUrlSchema, PROFILE_IMAGE_HOSTS } from "../utils/imageUrl.js";

const profileFields = {
  name: z
    .string()
    .trim()
    .min(2, "Name must contain at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .optional(),

  // null = ছবি মুছে ফেলা। নইলে শুধু আমাদের ImgBB আপলোড।
  image: z.union([imageUrlSchema(PROFILE_IMAGE_HOSTS), z.null()]).optional(),

  businessName: z
    .string()
    .trim()
    .min(2, "Business name must contain at least 2 characters")
    .max(120, "Business name cannot exceed 120 characters")
    .optional(),
};

export const updateProfileSchema = z
  .object(profileFields)
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one profile field to update",
  });
