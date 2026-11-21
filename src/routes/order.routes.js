import { Router } from "express";
import verifyToken from "../middleware/verifyToken.js";
import checkBlocked from "../middleware/checkBlocked.js";
import requireRole from "../middleware/requireRole.js";
import {
  CancelOrder,
  CreateOrder,
  GetMyOrders,
  GetOrderDetails,
} from "../controllers/order.controller.js";
import { ROLES } from "../utils/constants.js";

const router = Router();

// All order routes require an authenticated customer
router.use(verifyToken, checkBlocked, requireRole(ROLES.CUSTOMER));

router.post("/", CreateOrder);
router.get("/my-orders", GetMyOrders);
router.get("/:id", GetOrderDetails);
router.patch("/:id/cancel", CancelOrder);

export default router;
