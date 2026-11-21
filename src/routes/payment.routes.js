import { Router } from "express";

import verifyToken from "../middleware/verifyToken.js";
import checkBlocked from "../middleware/checkBlocked.js";
import requireRole from "../middleware/requireRole.js";

import { ROLES } from "../utils/constants.js";

import {
  CreateCheckoutSession,
  GetPaymentStatus,
  CreateBillingPortalSession,
} from "../controllers/payment.controller.js";

const router = Router();

router.use(verifyToken, checkBlocked, requireRole(ROLES.VENDOR));

router.post("/checkout", CreateCheckoutSession);
router.get("/status", GetPaymentStatus);
router.post("/portal", CreateBillingPortalSession);

export default router;
