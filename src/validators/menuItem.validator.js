import { z } from "zod";

// Common reusable fields.
const menuItemFields = {
  itemName: z
    .string()
    .trim()
    .min(2, "Item name must contain at least 2 characters")
    .max(100, "Item name cannot exceed 100 characters"),

  category: z
    .string()
    .trim()
    .min(2, "Category is required")
    .max(50, "Category cannot exceed 50 characters"),

  description: z
    .string()
    .trim()
    .min(10, "Description must contain at least 10 characters")
    .max(1000, "Description cannot exceed 1000 characters"),

  price: z
    .number()
    .positive("Price must be greater than zero")
    .finite("Price must be a valid number"),

  location: z
    .string()
    .trim()
    .min(2, "Location is required")
    .max(150, "Location cannot exceed 150 characters"),

  images: z
    .array(z.string().url("Each image must be a valid URL"))
    .min(1, "At least one image is required")
    .max(5, "Maximum 5 images are allowed"),
};

// POST /api/vendor/items
export const createMenuItemSchema = z.object(menuItemFields).strict();

// PATCH /api/vendor/items/:id
export const updateMenuItemSchema = z
  .object({
    itemName: menuItemFields.itemName,
    category: menuItemFields.category,
    description: menuItemFields.description,
    price: menuItemFields.price,
    location: menuItemFields.location,
    images: menuItemFields.images,
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// PATCH /api/vendor/items/:id/status
export const updateMenuItemAvailabilitySchema = z
  .object({
    isAvailable: z.boolean(),
  })
  .strict();
