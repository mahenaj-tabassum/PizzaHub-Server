import { z } from "zod";

export const updateVendorOrderStatusSchema = z
  .object({
    status: z.enum(["accepted", "rejected"]),
  })
  .strict();
