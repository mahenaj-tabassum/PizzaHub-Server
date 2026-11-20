import { Router } from "express";
import menuRoutes from "./menu.routes.js";
import vendorRoutes from "./vendor.routes.js";

const router = Router();

router.use("/menu", menuRoutes);
router.use("/vendor", vendorRoutes);

export default router;
