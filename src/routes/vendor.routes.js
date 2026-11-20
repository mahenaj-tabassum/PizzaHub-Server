import { Router } from "express";
import verifyToken from "../middleware/verifyToken.js";
import checkIsBlocked from "../middleware/checkBlocked.js";
import requiredRole from "../middleware/requireRole.js";
import {
  GetVendorOrders,
  UpdateVendorOrderStatus,
} from "../controllers/vendorOrder.controller.js";
import {
  CreateMenuItem,
  DeleteMenuItem,
  GetMyMenuItem,
  GetMySingleMenuItem,
  UpdateMenuItem,
  UpdateMenuItemAvailability,
} from "../controllers/vendorItem.controller.js";
import GetVendorStats from "../controllers/vendorStats.controller.js";
const router = Router();

// All routes in this router require an authenticated vendor
router.use(verifyToken, checkIsBlocked, requiredRole("vendor"));

// Menu item routes
router.post("/items", CreateMenuItem);
router.get("/items", GetMyMenuItem);
router.get("/items/:id", GetMySingleMenuItem);
router.patch("/items/:id", UpdateMenuItem);
router.delete("/items/:id", DeleteMenuItem);
router.patch("/items/:id/status", UpdateMenuItemAvailability);

// Order Routes
router.get("/orders", GetVendorOrders);
router.patch("/orders/:id/status", UpdateVendorOrderStatus);

// Dashboard statistics
router.get("/stats", GetVendorStats);


export default router