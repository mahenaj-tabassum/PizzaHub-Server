import { z } from "zod";
import { isValidDeliveryDate } from "../utils/dateValidation.js";

// Bangladesh local date: YYYY-MM-DD
const getTodayInBangladesh = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

// Create order validation
export const createOrderSchema = z
  .object({
    itemId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid menu item ID"),

    deliveryDate: z
      .string()
      .refine(isValidDeliveryDate, "Please provide a valid delivery date")
      .refine(
        (date) => date >= getTodayInBangladesh(),
        "Delivery date cannot be in the past",
      ),

    deliveryAddress: z
      .string()
      .trim()
      .min(10, "Delivery address must be at least 10 characters")
      .max(300, "Delivery address cannot exceed 300 characters"),

    message: z
      .string()
      .trim()
      .max(500, "Message cannot exceed 500 characters")
      .optional()
      .default(""),
  })
  .strict();
