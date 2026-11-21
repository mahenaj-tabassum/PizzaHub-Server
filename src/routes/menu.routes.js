// Responsibility:
import { Router } from "express";
import {
  GetAllMenuItems,
  GetFeaturedMenuItems,
  GetSingleMenuItem,
} from "../controllers/menu.controller.js";

const router = Router();

router.get("/", GetAllMenuItems);
router.get("/featured", GetFeaturedMenuItems);
router.get("/:id", GetSingleMenuItem);

export default router;
