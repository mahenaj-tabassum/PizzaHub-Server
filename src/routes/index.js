import { Router } from "express";

import menuRoutes from "./menu.routes.js";
import vendorRoutes from "./vendor.routes.js";
import orderRoutes from "./order.routes.js";
import customerRoutes from "./customer.routes.js";
import adminRoutes from "./admin.routes.js";
import uploadRoutes from "./upload.routes.js";
import userRoutes from "./user.routes.js";
import paymentRoutes from "./payment.routes.js";

const router = Router();

router.use("/menu", menuRoutes);
router.use("/vendor", vendorRoutes);
router.use("/orders", orderRoutes);
router.use("/customer", customerRoutes);
router.use("/admin", adminRoutes);
router.use("/payment", paymentRoutes);
router.use("/upload", uploadRoutes);
router.use("/users", userRoutes);

export default router;
