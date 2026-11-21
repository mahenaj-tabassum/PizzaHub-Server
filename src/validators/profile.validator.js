import { z } from "zod";

const profileFields = {
  name: z
    .string()
    .trim()
    .min(2, "Name must contain at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .optional(),

  image: z
    .union([z.string().trim().url("Image must be a valid URL"), z.null()])
    .optional(),

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
