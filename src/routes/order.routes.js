import { Router } from "express";

import verifyToken from "../middleware/verifyToken.js";
import checkBlocked from "../middleware/checkBlocked.js";
import requireRole from "../middleware/requireRole.js";

import validate from "../middleware/validate.js";
import { createOrderSchema } from "../validators/order.validator.js";

import {
  CancelOrder,
  CreateOrder,
  GetMyOrders,
  GetOrderDetails,
} from "../controllers/order.controller.js";

const router = Router();

// All order routes require an authenticated customer
router.use(verifyToken, checkBlocked, requireRole("customer"));

// Create Order
router.post("/", validate(createOrderSchema), CreateOrder);

// Get all orders belonging to current customer
router.get("/my-orders", GetMyOrders);

// Get single order details
router.get("/:id", GetOrderDetails);

// Cancel pending order
router.patch("/:id/cancel", CancelOrder);

export default router;
