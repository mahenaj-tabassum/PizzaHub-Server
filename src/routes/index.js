import { Router } from "express";
import menuRoutes from "./menu.routes.js";
import vendorRoutes from "./vendor.routes.js";
import orderRoutes from "./order.routes.js";
import customerRoutes from "./customer.routes.js";

const router = Router();

router.use("/menu", menuRoutes);
router.use("/vendor", vendorRoutes);
router.use("/order", orderRoutes);
router.use("/customer", customerRoutes);

export default router;
