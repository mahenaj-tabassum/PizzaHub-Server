import { Router } from "express";

import verifyToken from "../middleware/verifyToken.js";
import checkBlocked from "../middleware/checkBlocked.js";
import requireRole from "../middleware/requireRole.js";
import validate from "../middleware/validate.js";
import GetVendorStats from "../controllers/vendorStats.controller.js";
import CreatePremiumCheckoutSession from "../controllers/subscription.controller.js";

import { ROLES } from "../utils/constants.js";

import { updateVendorOrderStatusSchema } from "../validators/vendorOrder.validator.js";

import {
  createMenuItemSchema,
  updateMenuItemSchema,
  updateMenuItemAvailabilitySchema,
} from "../validators/menuItem.validator.js";

import {
  CreateMenuItem,
  GetMyMenuItem,
  GetMySingleMenuItem,
  UpdateMenuItem,
  DeleteMenuItem,
  UpdateMenuItemAvailability,
} from "../controllers/vendorItem.controller.js";

import {
  GetVendorOrders,
  UpdateVendorOrderStatus,
} from "../controllers/vendorOrder.controller.js";


const router = Router();

// Every vendor route requires authentication,
// an unblocked account, and the vendor role.
router.use(verifyToken, checkBlocked, requireRole(ROLES.VENDOR));

// Menu item management
router.post("/items", validate(createMenuItemSchema), CreateMenuItem);

router.get("/items", GetMyMenuItem);

router.get("/items/:id", GetMySingleMenuItem);

router.patch("/items/:id", validate(updateMenuItemSchema), UpdateMenuItem);

router.delete("/items/:id", DeleteMenuItem);

router.patch(
  "/items/:id/status",
  validate(updateMenuItemAvailabilitySchema),
  UpdateMenuItemAvailability,
);

// Vendor order management
router.get("/orders", GetVendorOrders);

router.patch(
  "/orders/:id/status",
  validate(updateVendorOrderStatusSchema),
  UpdateVendorOrderStatus,
);
// Vendor dashboard statistics
router.get("/stats", GetVendorStats);

router.post('/subscription/checkout', CreatePremiumCheckoutSession)

export default router;
