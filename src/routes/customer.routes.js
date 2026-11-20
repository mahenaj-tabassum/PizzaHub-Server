import { Router } from "express";

import verifyToken from "../middleware/verifyToken.js";
import checkBlocked from "../middleware/checkBlocked.js";
import requireRole from "../middleware/requireRole.js";

import getCustomerStats from "../controllers/customerStats.controller.js";

const router = Router();

router.use(verifyToken, checkBlocked, requireRole("customer"));

router.get("/stats", getCustomerStats);

export default router;
